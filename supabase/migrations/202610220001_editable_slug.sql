begin;

-- Editable slug: the reporter may propose the Latin address, typing it or taking
-- the title's transliteration. The server still owns uniqueness and shape.
--
-- Same contract as 202610210001, plus: when p_slug arrives non-empty it is
-- normalised through slugify_title (so "My Story!" and a Bengali custom value
-- both land in [a-z0-9-]), rejected when nothing transliterable remains, and
-- given the next free numeric suffix when taken. Empty stays title-derived.
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
  p_published_at timestamptz default null,
  p_interview_kind text default null
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
  interview_kind_value text;
  slug_base text;
  slug_candidate text;
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
  -- The interview desk always names how the conversation happened; no other desk may.
  if p_category_slug = 'interview' then
    -- `coalesce` because `null not in (...)` is null, not true: a missing choice must fail here.
    if coalesce(p_interview_kind, '') not in ('virtual', 'in-person') then
      raise exception 'সাক্ষাৎকারের ধরন (ভার্চুয়াল / ইন-পার্সন) নির্বাচন করুন';
    end if;
    interview_kind_value := p_interview_kind;
  else
    if p_interview_kind is not null then
      raise exception 'এই বিভাগে সাক্ষাৎকারের ধরন প্রযোজ্য নয়';
    end if;
    interview_kind_value := null;
  end if;
  perform pg_advisory_xact_lock(hashtext('article_questionnaire_version'));
  select q.id into questionnaire_id from public.article_questionnaire_versions q where q.active;
  if questionnaire_id is null then raise exception 'প্রশ্নমালা এখনো প্রস্তুত নয়'; end if;
  if p_questionnaire_version_id is not null and p_questionnaire_version_id <> questionnaire_id then raise exception 'প্রশ্নমালা হালনাগাদ হয়েছে; পাতা রিফ্রেশ করে আবার চেষ্টা করুন'; end if;
  validated_answers := public.validate_article_questionnaire_answers(questionnaire_id, coalesce(p_questionnaire_answers, '{}'::jsonb));

  -- A proposed address is normalised the same way a title is, so typing
  -- "My-Story!!" claims "my-story". Anything with no Latin left in it is a
  -- sentence, not an address, and is refused rather than silently replaced.
  slug_base := nullif(btrim(coalesce(p_slug, '')), '');
  if slug_base is not null then
    slug_base := public.slugify_title(slug_base);
    if slug_base is null or slug_base = '' then
      raise exception 'ঠিকানাটি ইংরেজি ছোট হরফ, সংখ্যা ও হাইফেনে লিখুন';
    end if;
  end if;

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
      -- A typed address keeps its base on the first try and takes the next
      -- numeric suffix on a collision; an empty one stays title-derived.
      if slug_base is not null then
        slug_candidate := case when attempt = 1 then slug_base else slug_base || '-' || attempt::text end;
      else
        slug_candidate := public.allocate_article_slug(p_title);
      end if;
      insert into public.articles (author_id, category_id, slug, title, excerpt, body, hero_media_key, status, published_at, is_anonymous, interview_kind)
      values (case when anonymous then null else owner end, category, slug_candidate, trim(p_title), excerpt_text, trim(p_body), hero_text,
        case when actor_role = 'reporter' and actor_tier = 'junior' then 'pending'::public.article_status else 'published'::public.article_status end,
        case when actor_role = 'reporter' and actor_tier = 'junior' then null else least(coalesce(p_published_at, now()), now()) end,
        anonymous, interview_kind_value) returning * into created;
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

commit;
