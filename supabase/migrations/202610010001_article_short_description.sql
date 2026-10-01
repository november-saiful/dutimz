-- Short descriptions are derived, not typed.
--
-- The publishing form used to ask a reporter to write a second summary of their own report, and
-- a blank one failed the client-side form before the server ever saw the submission. The excerpt
-- is still a first-class column (cards, metadata, search all read it), so it is now computed from
-- the body instead: the first sentence when one fits, otherwise a word-boundary cut. A caller may
-- still pass an explicit excerpt; only a blank one falls back to the derived text.
begin;

create or replace function public.derive_excerpt(p_body text)
returns text
language plpgsql immutable set search_path = '' as $$
declare
  normalized text;
  candidate text;
  last_sentence integer;
begin
  normalized := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
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

-- submit_article keeps its full signature; only the excerpt source changes.
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
  hero_text text;
  gkey text;
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
  if questionnaire_id is null then raise exception 'প্রশ্নমালা এখনো প্রস্তুত নয়'; end if;
  if p_questionnaire_version_id is not null and p_questionnaire_version_id <> questionnaire_id then raise exception 'প্রশ্নমালা হালনাগাদ হয়েছে; পাতা রিফ্রেশ করে আবার চেষ্টা করুন'; end if;
  validated_answers := public.validate_article_questionnaire_answers(questionnaire_id, coalesce(p_questionnaire_answers, '{}'::jsonb));

  if p_media_keys is not null then
    select coalesce(array_agg(dedup.k order by dedup.ord), '{}') into gallery
      from (select lower(btrim(entry.k)) as k, min(entry.ord) as ord from unnest(p_media_keys) with ordinality as entry(k, ord)
            where entry.k is not null and btrim(entry.k) <> '' group by 1) dedup;
  end if;
  if coalesce(array_length(gallery, 1), 0) > 10 then raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়'; end if;
  hero_text := nullif(trim(coalesce(p_hero_media_key, '')), '');
  if hero_text is not null and coalesce(array_length(gallery, 1), 0) > 0 then
    select value into normalized_media_key from unnest(gallery) as key_list(value) where value = hero_text;
    if normalized_media_key is null then raise exception 'প্রচ্ছদের ছবি গ্যালারির অংশ হতে হবে'; end if;
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
  insert into public.article_media (article_id, media_id, position) select created.id, item.key::uuid, item.ord - 1 from unnest(gallery) with ordinality as item(key, ord);
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
  if created.status = 'published' then perform public.add_article_earning(created.id, owner); end if;
  return created;
end;
$$;
revoke all on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz) from public, anon;
grant execute on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz) to authenticated;

-- The desk edit and the author's own edit derive the excerpt the same way when it is blank, so a
-- correction form that only sends a new body does not have to restate the summary.
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
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সম্পাদনার কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  excerpt_text := coalesce(nullif(trim(coalesce(p_excerpt, '')), ''), public.derive_excerpt(p_body));
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

create or replace function public.update_own_article(p_article_id uuid, p_title text, p_excerpt text, p_body text, p_reason text)
returns public.articles language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  next_version integer;
  result public.articles;
  actor_role public.app_role;
  actor_tier public.reporter_tier;
  owner_id uuid;
  excerpt_text text;
begin
  select role, reporter_tier into actor_role, actor_tier from public.user_roles where user_id = actor;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then raise exception 'সম্পাদনার কারণ আবশ্যক (৩–৫০০ অক্ষর)'; end if;
  select * into target from public.articles where id = p_article_id for update;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if target.id is null or owner_id is distinct from actor or target.status <> 'published' then raise exception 'প্রকাশিত নিজের প্রতিবেদন সম্পাদনা করার অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if actor_role not in ('admin', 'moderator') and not (actor_role = 'reporter' and actor_tier = 'executive') then raise exception 'এই রিপোর্টার স্তরে প্রকাশিত প্রতিবেদন সম্পাদনা করা যাবে না' using errcode = '42501'; end if;
  excerpt_text := coalesce(nullif(trim(coalesce(p_excerpt, '')), ''), public.derive_excerpt(p_body));
  select coalesce(max(version), 0) + 1 into next_version from public.article_revisions where article_id = p_article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version, target.title, target.excerpt, target.body, trim(p_reason));
  update public.articles set title = trim(p_title), excerpt = excerpt_text, body = trim(p_body)
    where id = p_article_id returning * into result;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version + 1, result.title, result.excerpt, result.body, trim(p_reason));
  if actor_role in ('admin', 'moderator') then
    insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
      values (actor, 'edit_article', p_article_id, owner_id, trim(p_reason), jsonb_build_object('revision', next_version + 1));
  end if;
  return result;
end;
$$;

revoke all on function public.derive_excerpt(text) from public, anon, authenticated;

commit;
