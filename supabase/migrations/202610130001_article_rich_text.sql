-- News bodies become Markdown, and a story's pictures can sit inside its text.
--
-- A body is authored Markdown now: a writer pastes from a web page, Word or a spreadsheet and keeps
-- the headings, bold, lists, links, quotes and tables. Markdown was chosen over HTML precisely so
-- that nothing downstream has to change: `body` stays the plain `text` column that `search_document`
-- indexes, that `article_revisions` snapshots, and that every reader already renders. The one rule
-- that DOES have to learn about it is `derive_excerpt`, which derives a story's summary from its
-- body and would otherwise put `##` and image paths in front of a reader.
--
-- The pictures are the part that cannot live in the text alone. The media Worker resolves a news
-- object through `get_media_asset`, which grants a public read on exactly two conditions: the object
-- is the story's hero, or it has a row in `article_media` for a published story. A picture written
-- into the body is therefore invisible to a reader until this migration has turned that reference
-- into an attachment row — which is the reason this file exists, and why `get_media_asset` is
-- deliberately left alone. The same reconciliation is written once here and reused by the approval
-- path in `202610130003_pending_content_edits.sql`.
begin;

-- Keep the two ways a picture is attached as separate facts. A file can be both a gallery entry
-- and referenced inline; removing the inline Markdown must not silently remove the gallery image.
-- Existing attachments predate inline Markdown, so they remain explicit gallery entries.
alter table public.article_media
  add column is_gallery boolean not null default true,
  add column is_inline boolean not null default false,
  add constraint article_media_attachment_kind check (is_gallery or is_inline);

/*
  The pictures a body refers to, in reading order and without repeats.

  `p_base` names the path prefix that counts as a reference: '/media' for a news story and
  '/spotlight/media' for a Spotlight post. The composer writes them as ordinary Markdown —
  `![alt](/media/<uuid>)` — so a writer never has to name an id, and this function is the one place
  that decides what a reference looks like to the database. The path is matched right after the
  `](` of an image, so a pasted `https://host/media/<uuid>` is not mistaken for one of ours.

  This single definition is shared: the Spotlight migration and the pending-edit migration both call
  it with this exact signature, and none of them may change it.
*/
create or replace function public.body_media_ids(p_body text, p_base text)
returns uuid[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(referenced.media_id order by referenced.first_at), '{}'::uuid[])
    from (
      -- `distinct on` keeps each id's first reference; the aggregation above then walks the ids in
      -- the order they appear in the text, which is the order their attachment rows are numbered in.
      select distinct on (lower(found.captures[1]))
             lower(found.captures[1])::uuid as media_id,
             found.ord as first_at
        from regexp_matches(
               coalesce(p_body, ''),
               '!\[[^\]]*\]\(\s*' || p_base || '/'
                 || '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})'
                 || '(\s+"[^"]*")?\s*\)',
               'g') with ordinality as found(captures, ord)
       order by lower(found.captures[1]), found.ord
    ) referenced;
$$;

/*
  The summary a reader sees in a feed, a share card and a search result.

  Unchanged in every way except one: the body arrives as Markdown, and an excerpt is prose. So the
  markup is stripped first — an image goes entirely, a link keeps the words the reader would have
  seen, and the scaffolding that only means something to a Markdown parser (heading marks, list
  bullets, quote carets, emphasis, code ticks, table rules and cell borders) is removed — and the
  sentence window below then works on what a person would actually read.

  The line-anchored rules pass the `n` flag so `^` matches at each line start; `[ \t]` is used rather
  than `\s` in them, because `\s` would also swallow the newline that ends the line.
*/
create or replace function public.derive_excerpt(p_body text)
returns text
language plpgsql immutable set search_path = '' as $$
declare
  normalized text;
  candidate text;
  last_sentence integer;
  stripped text;
begin
  stripped := coalesce(p_body, '');
  stripped := regexp_replace(stripped, '!\[[^\]]*\]\([^)]*\)', '', 'g');
  stripped := regexp_replace(stripped, '\[([^\]]*)\]\([^)]*\)', '\1', 'g');
  stripped := regexp_replace(stripped, '\[([^\]]*)\]\[[^\]]*\]', '\1', 'g');
  stripped := regexp_replace(stripped, '^[ \t]{0,3}#{1,6}[ \t]+', '', 'gn');
  stripped := regexp_replace(stripped, '^[ \t]{0,3}>[ \t]?', '', 'gn');
  stripped := regexp_replace(stripped, '^[ \t]{0,3}[-*+][ \t]+', '', 'gn');
  stripped := regexp_replace(stripped, '^[ \t]{0,3}[0-9]{1,9}\.[ \t]+', '', 'gn');
  -- A table's separator row is punctuation only, and its pipes are cell borders rather than words.
  stripped := regexp_replace(stripped, '^[ \t]*\|?[ \t:|-]+\|?[ \t]*$', ' ', 'gn');
  stripped := regexp_replace(stripped, '\|', ' ', 'g');
  stripped := regexp_replace(stripped, '\*\*|__|~~|`', '', 'g');
  stripped := regexp_replace(stripped, '\*', '', 'g');

  normalized := btrim(regexp_replace(stripped, '\s+', ' ', 'g'));
  if normalized = '' then return ''; end if;
  -- A little more than the column's ceiling so a sentence cut has room to end.
  candidate := left(normalized, 240);
  -- Prefer the last complete Bengali sentence inside the window.
  if position('।' in reverse(candidate)) > 0 then
    last_sentence := length(candidate) - position('।' in reverse(candidate)) + 1;
    if last_sentence >= 10 then candidate := left(candidate, last_sentence); end if;
  end if;
  if length(candidate) > 200 then
    candidate := left(candidate, 200);
    if position(' ' in reverse(candidate)) > 0 then
      candidate := left(candidate, length(candidate) - position(' ' in reverse(candidate)));
    end if;
  end if;
  candidate := btrim(candidate);
  -- The column requires at least ten characters; a short body yields what it yields.
  if length(candidate) < 10 then candidate := left(normalized, 280); end if;
  return candidate;
end;
$$;

-- submit_article: same contract as 202610100001, plus the pictures the body places in its text.
create or replace function public.submit_article(
  p_category_slug text,
  p_title text,
  p_excerpt text,
  p_body text,
  p_hero_media_key text default null,
  p_slug text default null,
  p_media_keys text[] default null,
  p_questionnaire_answers jsonb default '{}'::jsonb,
  p_questionnaire_version_id uuid default null,
  p_is_anonymous boolean default false,
  p_author_id uuid default null,
  p_published_at timestamptz default null
)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.app_role;
  actor_tier public.reporter_tier;
  category uuid;
  created public.articles;
  attempt integer := 0;
  gallery text[] := '{}';
  inline_media uuid[] := '{}';
  hero_text text;
  gkey text;
  media_key uuid;
  questionnaire_id uuid;
  validated_answers jsonb;
  normalized_media_key text;
  anonymous boolean := coalesce(p_is_anonymous, false);
  owner uuid;
  excerpt_text text;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select role, reporter_tier into actor_role, actor_tier from public.user_roles where user_id = actor;
  if actor_role not in ('reporter', 'moderator', 'admin') then raise exception 'প্রতিবেদন জমা দিতে রিপোর্টার অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if (p_author_id is not null or p_published_at is not null) and not public.is_admin() then
    raise exception 'লেখক নির্বাচন ও প্রকাশের সময় নির্ধারণ কেবল নির্বাহী করতে পারেন' using errcode = '42501';
  end if;
  owner := coalesce(p_author_id, actor);
  if p_author_id is not null then
    perform 1 from public.profiles where id = p_author_id;
    if not found then raise exception 'নির্বাচিত লেখকের প্রোফাইল পাওয়া যায়নি'; end if;
  end if;
  select id into category from public.categories where slug = p_category_slug and active;
  if category is null then raise exception 'সংবাদ বিভাগ পাওয়া যায়নি'; end if;
  perform pg_advisory_xact_lock(hashtext('article_questionnaire_version'));
  select q.id into questionnaire_id from public.article_questionnaire_versions q where q.active;
  if questionnaire_id is null then raise exception 'প্রশ্নমালা এখনো প্রস্তুত নয়'; end if;
  if p_questionnaire_version_id is not null and p_questionnaire_version_id <> questionnaire_id then raise exception 'প্রশ্নমালা হালনাগাদ হয়েছে; পাতা রিফ্রেশ করে আবার চেষ্টা করুন'; end if;
  validated_answers := public.validate_article_questionnaire_answers(questionnaire_id, coalesce(p_questionnaire_answers, '{}'::jsonb));

  if p_media_keys is not null then
    select coalesce(array_agg(dedup.k order by dedup.ord), '{}') into gallery
      from (select lower(btrim(entry.k)) as k, min(entry.ord) as ord from unnest(p_media_keys) with ordinality as entry(k, ord)
            where entry.k is not null and btrim(entry.k) <> '' group by 1) dedup;
  end if;
  if coalesce(array_length(gallery, 1), 0) > 10 then raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়'; end if;
  hero_text := nullif(trim(coalesce(p_hero_media_key, '')), '');
  if hero_text is not null then
    if coalesce(array_length(gallery, 1), 0) > 0 then
      select value into normalized_media_key from unnest(gallery) as key_list(value) where value = hero_text;
      if normalized_media_key is null then raise exception 'প্রচ্ছদের ছবি গ্যালারির অংশ হতে হবে'; end if;
    else
      gallery := array[hero_text];
    end if;
  end if;
  foreach gkey in array gallery loop
    if gkey !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'ছবির তালিকায় অবৈধ ফাইল আইডি আছে'; end if;
    perform 1 from public.media_assets m where m.id = gkey::uuid and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then raise exception 'যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি'; end if;
  end loop;
  if hero_text is not null then
    if hero_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'প্রচ্ছদের ছবির আইডি সঠিক নয়'; end if;
    perform 1 from public.media_assets m where m.id = hero_text::uuid and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then raise exception 'প্রচ্ছদের ছবিটি পাওয়া যায়নি বা আপনার আপলোড করা নয়'; end if;
  end if;
  -- Pictures the body places in its text. They are the submitter's own uploads for the same reason
  -- the gallery is: attaching them to the story is what makes them publicly readable.
  inline_media := coalesce(public.body_media_ids(p_body, '/media'), '{}');
  foreach media_key in array inline_media loop
    perform 1 from public.media_assets m where m.id = media_key and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then raise exception 'লেখার মধ্যে যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি'; end if;
  end loop;
  if (select count(distinct attached.media_id)
        from unnest(coalesce(gallery::uuid[], '{}') || inline_media
                    || case when hero_text is null then '{}'::uuid[] else array[hero_text::uuid] end)
             as attached(media_id)) > 10 then
    raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;
  excerpt_text := coalesce(nullif(trim(coalesce(p_excerpt, '')), ''), public.derive_excerpt(p_body));
  loop
    attempt := attempt + 1;
    begin
      insert into public.articles (author_id, category_id, slug, title, excerpt, body, hero_media_key, status, published_at, is_anonymous)
      values (case when anonymous then null else owner end, category, public.allocate_article_slug(p_title), trim(p_title), excerpt_text, trim(p_body), hero_text,
        case when actor_role = 'reporter' and actor_tier = 'junior' then 'pending'::public.article_status else 'published'::public.article_status end,
        case when actor_role = 'reporter' and actor_tier = 'junior' then null else least(coalesce(p_published_at, now()), now()) end,
        anonymous) returning * into created;
      exit;
    exception when unique_violation then
      if attempt >= 4 then raise; end if;
    end;
  end loop;
  insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
  select created.id, item.key::uuid, item.ord - 1, true, false
    from unnest(gallery) with ordinality as item(key, ord);
  -- Mark an explicit gallery image as also occurring inline. Then insert the remaining inline-only
  -- images in document order, appending them one-by-one to preserve the unique position constraint.
  update public.article_media am set is_inline = true
   where am.article_id = created.id and am.media_id = any (inline_media);
  for media_key in
    select item.key from unnest(inline_media) with ordinality as item(key, ord)
     where not exists (select 1 from public.article_media am
                        where am.article_id = created.id and am.media_id = item.key)
     order by item.ord
  loop
    insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
    select created.id, media_key, coalesce(max(am.position) + 1, 0), false, true
      from public.article_media am where am.article_id = created.id;
  end loop;
  insert into public.article_questionnaire_responses(article_id, questionnaire_version_id, answers) values (created.id, questionnaire_id, validated_answers);
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason) values (created.id, actor, 1, created.title, created.excerpt, created.body, 'প্রাথমিক জমা');
  if anonymous then
    insert into public.article_attributions (article_id, author_id) values (created.id, owner);
    insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
      values (actor, 'submit_anonymous_article', created.id, 'নাম প্রকাশে অনিচ্ছুক', jsonb_build_object('title', created.title, 'status', created.status));
  end if;
  if owner <> actor then
    insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
      values (actor, 'publish_on_behalf', created.id, 'লেখকের নামে প্রকাশ',
        jsonb_build_object('author_id', owner, 'anonymous', anonymous, 'published_at', created.published_at));
  end if;
  return created;
end;
$$;

-- admin_update_article: same contract as 202610010001, plus the same reconciliation. The desk's own
-- edit applies immediately — an administrator is already the approval authority — so this is the one
-- path that may change a published body without a request behind it.
create or replace function public.admin_update_article(
  p_article_id uuid,
  p_title text,
  p_excerpt text,
  p_body text,
  p_reason text
)
returns public.articles language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  result public.articles;
  next_version integer;
  owner_id uuid;
  excerpt_text text;
  gallery_media uuid[];
  proposed_inline uuid[];
  media_key uuid;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সম্পাদনার কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  excerpt_text := coalesce(nullif(trim(coalesce(p_excerpt, '')), ''), public.derive_excerpt(p_body));

  /*
    Reconcile the pictures the body places against `article_media`.

    Inline-only attachments are distinct from gallery attachments, so a text correction can remove
    an inline picture without accidentally removing a gallery entry that uses the same media id.
  */
  proposed_inline := coalesce(public.body_media_ids(p_body, '/media'), '{}');
  -- The pictures already in the body are the author's uploads; one the desk is adding now is the
  -- desk's own. Anything else would publish a third party's private upload.
  foreach media_key in array proposed_inline loop
    perform 1 from public.media_assets m
      where m.id = media_key and m.mime_type like 'image/%'
        and (m.owner_id = owner_id or m.owner_id = actor);
    if not found then raise exception 'যোগ করা ছবিগুলো লেখক বা আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি'; end if;
  end loop;
  select coalesce(array_agg(am.media_id order by am.position), '{}') into gallery_media
    from public.article_media am where am.article_id = p_article_id and am.is_gallery;
  if (select count(distinct attached.media_id)
        from (
          select unnest(gallery_media) as media_id
          union select unnest(proposed_inline)
          union select nullif(target.hero_media_key, '')::uuid
        ) attached
       where attached.media_id is not null) > 10 then
    raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;
  -- Reconcile inline placements against a body edit. Gallery rows are independent attachments,
  -- including the rare image that is in both places, so never delete or reposition those rows.
  update public.article_media am set is_inline = false
   where am.article_id = p_article_id and am.is_inline;
  update public.article_media am set is_inline = true
   where am.article_id = p_article_id
     and am.is_gallery and am.media_id = any (proposed_inline);
  -- Remove obsolete inline-only rows before appending new ones; existing gallery positions stay put.
  delete from public.article_media am
   where am.article_id = p_article_id and not am.is_gallery;
  -- Append new inline-only ids sequentially after the existing maximum. Since rows are inserted one
  -- at a time, the unique (article_id, position) constraint is never handed a colliding batch.
  for media_key in
    select item.key from unnest(proposed_inline) with ordinality as item(key, ord)
     where not exists (select 1 from public.article_media am
                        where am.article_id = p_article_id and am.media_id = item.key)
     order by item.ord
  loop
    insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
    select p_article_id, media_key, coalesce(max(am.position) + 1, 0), false, true
      from public.article_media am where am.article_id = p_article_id;
  end loop;

  select coalesce(max(version), 0) + 1 into next_version
    from public.article_revisions where article_id = p_article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version, target.title, target.excerpt, target.body, trim(p_reason));
  update public.articles set title = trim(p_title), excerpt = excerpt_text, body = trim(p_body)
   where id = p_article_id returning * into result;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version + 1, result.title, result.excerpt, result.body, trim(p_reason));
  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
    values (actor, 'edit_article', p_article_id, owner_id, trim(p_reason),
      jsonb_build_object('revision', next_version + 1, 'scope', 'admin'));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'edit_article', p_article_id, trim(p_reason), jsonb_build_object('revision', next_version + 1));
  return result;
end;
$$;

-- `get_media_asset` and `body_media_ids`' callers resolve a picture with
-- `exists (select 1 from article_media where media_id = ...)`. That lookup is by media_id, the
-- trailing column of this table's primary key, so it cannot use the key and reads the whole index
-- instead. Pictures placed inside a body multiply the rows per story, which makes the one query
-- behind every news image on the site the place to fix it. The Spotlight table gets the same index
-- in `202610130002_spotlight_rich_text.sql` for the same reason.
create index if not exists article_media_media_idx on public.article_media (media_id);

-- Same treatment as the Spotlight helper: the database resolves references, clients never do.
revoke all on function public.body_media_ids(text, text) from public, anon, authenticated;
revoke all on function public.derive_excerpt(text) from public, anon, authenticated;
revoke all on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz) from public, anon;
revoke all on function public.admin_update_article(uuid, text, text, text, text) from public, anon;
grant execute on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz) to authenticated;
grant execute on function public.admin_update_article(uuid, text, text, text, text) to authenticated;

commit;
