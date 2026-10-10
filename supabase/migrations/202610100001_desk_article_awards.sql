-- Publishing no longer credits the reporter. Earlier migrations paid a tier fee every time a story
-- went live (on submit, approval, and restoring a withdrawn story). That payment is now the desk's
-- decision: `admin_award_article` records one amount per story, chosen by an administrator.
--
-- Existing ledger rows are append-only and stay as they are. Only the publish paths change.
begin;

-- submit_article: same contract as 202610010001, minus the automatic fee.
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
  return created;
end;
$$;
revoke all on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz) from public, anon;
grant execute on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz) to authenticated;

-- moderate_article: approval publishes the story and nothing else. The fee is the desk's call now.
create or replace function public.moderate_article(p_article_id uuid, p_decision text, p_reason text)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  updated public.articles;
  logged_action text;
  owner_id uuid;
begin
  if not public.is_moderator_or_admin() then raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then raise exception 'সিদ্ধান্তের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'সিদ্ধান্ত অনুমোদন অথবা প্রত্যাখ্যান হতে হবে'; end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null or target.status <> 'pending' then raise exception 'প্রতিবেদনটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if owner_id = actor and p_decision = 'approve' then raise exception 'নিজের প্রতিবেদন নিজে অনুমোদন করা যাবে না' using errcode = '42501'; end if;
  logged_action := case when p_decision = 'approve' then 'approve_article' else 'reject_article' end;
  update public.articles set
    status = case when p_decision = 'approve' then 'published'::public.article_status else 'rejected'::public.article_status end,
    published_at = case when p_decision = 'approve' then coalesce(target.published_at, now()) else null end,
    rejected_at = case when p_decision = 'reject' then now() else null end,
    rejection_reason = case when p_decision = 'reject' then trim(p_reason) else null end
    where id = p_article_id returning * into updated;
  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason)
    values (actor, logged_action, p_article_id, owner_id, trim(p_reason));
  return updated;
end;
$$;

-- admin_set_article_status: taking a story down and putting it back no longer pays anyone.
create or replace function public.admin_set_article_status(
  p_article_id uuid,
  p_status text,
  p_reason text
)
returns public.articles language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  result public.articles;
  owner_id uuid;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'পরিবর্তনের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  if p_status not in ('published', 'rejected') then
    raise exception 'প্রতিবেদন প্রকাশিত অথবা প্রত্যাখ্যাত অবস্থায় রাখা যায়';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  if target.status::text = p_status then raise exception 'প্রতিবেদনটি ইতিমধ্যে এই অবস্থায় আছে'; end if;
  owner_id := coalesce(target.author_id,
    (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  update public.articles set
    status = p_status::public.article_status,
    -- The original dateline is kept when a story is withheld and restored, so re-publishing does
    -- not silently re-date reporting that happened earlier. Only a story that never had a date
    -- gets one now.
    published_at = case when p_status = 'published' then coalesce(target.published_at, now()) else target.published_at end,
    rejected_at = case when p_status = 'rejected' then now() else null end,
    rejection_reason = case when p_status = 'rejected' then trim(p_reason) else null end
   where id = p_article_id returning * into result;
  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
    values (actor, 'set_article_status', p_article_id, owner_id, trim(p_reason),
      jsonb_build_object('from', target.status::text, 'to', result.status::text));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'set_article_status', p_article_id, trim(p_reason),
      jsonb_build_object('from', target.status::text, 'to', result.status::text));
  return result;
end;
$$;

-- The automatic per-publication credit is gone, so nothing calls this any more.
drop function if exists public.add_article_earning(uuid, uuid);

-- The desk's one money decision for a story: a single amount, credited as available money to the
-- person the story credits. One award per story, enforced by the ledger's unique article index,
-- so a second decision cannot double-pay. Every award is written to the audit log with the reason.
create or replace function public.admin_award_article(
  p_article_id uuid,
  p_amount_tk integer,
  p_reason text
)
returns public.earnings_ledger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  owner_id uuid;
  owner_tier public.reporter_tier;
  result public.earnings_ledger;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  if p_amount_tk is null or p_amount_tk < 1 or p_amount_tk > 1000000 then
    raise exception 'টাকার পরিমাণ ১ থেকে ১০,০০,০০০ টাকার মধ্যে হতে হবে';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  if target.status <> 'published' then raise exception 'শুধু প্রকাশিত প্রতিবেদনে অর্থ নির্ধারণ করা যায়'; end if;
  owner_id := coalesce(target.author_id,
    (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if owner_id is null then raise exception 'প্রতিবেদনের লেখক নির্ধারণ করা যায়নি'; end if;
  if exists (
    select 1 from public.earnings_ledger l
     where l.article_id = p_article_id
       and l.entry_type in ('article_earning_available', 'article_earning_held')
  ) then
    raise exception 'এই প্রতিবেদনে ইতিমধ্যে অর্থ নির্ধারণ করা হয়েছে';
  end if;
  select r.reporter_tier into owner_tier from public.user_roles r where r.user_id = owner_id;
  insert into public.earnings_ledger (user_id, article_id, entry_type, amount_tk, reporter_tier_snapshot, reason, created_by)
    values (owner_id, p_article_id, 'article_earning_available', p_amount_tk, owner_tier, trim(p_reason), actor)
    returning * into result;
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'award_article', p_article_id, trim(p_reason),
      jsonb_build_object('amount_tk', p_amount_tk, 'author_id', owner_id, 'ledger_id', result.id));
  return result;
end;
$$;
revoke all on function public.admin_award_article(uuid, integer, text) from public, anon;
grant execute on function public.admin_award_article(uuid, integer, text) to authenticated;

commit;
