-- Anonymous filing.
--
-- The byline on every public page is derived from articles.author_id, and both the
-- anon and authenticated roles can select that column: the publishable key is
-- handed to every browser, so anyone can join articles to profiles over the public
-- REST API. Hiding the byline in the interface would therefore hide nothing. The
-- public row loses the author instead -- author_id goes null for anonymous stories
-- -- and the real author moves to a side table that only the desk and the author
-- can read. Everything that genuinely needs to know who filed a story (the
-- approval guard, the earning, the withdrawal gate, the admin queues) resolves it
-- through that attribution.
begin;

alter table public.articles add column is_anonymous boolean not null default false;
alter table public.articles alter column author_id drop not null;
-- Keeps the two representations of authorship from drifting: a story is either
-- credited on its own row or anonymous and attributed out of band, never both and
-- never neither.
alter table public.articles add constraint articles_author_matches_anonymity
  check (is_anonymous = (author_id is null));

create table public.article_attributions (
  article_id uuid primary key references public.articles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index article_attributions_author_idx on public.article_attributions (author_id, created_at desc);

alter table public.article_attributions enable row level security;
revoke all on public.article_attributions from anon, authenticated;
grant select on public.article_attributions to authenticated;
create policy article_attribution_read on public.article_attributions for select to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- An anonymous story belongs to its author as much as any other: they can read it,
-- and read its pictures and revision history. These are separate permissive
-- policies rather than additions to the existing ones because those also apply to
-- anon, and anon may not read the attribution table -- referencing it there would
-- turn every anonymous read into a permission error.
create policy articles_attributed_author_read on public.articles for select to authenticated
  using (exists (select 1 from public.article_attributions aa
                  where aa.article_id = articles.id and aa.author_id = (select auth.uid())));

create policy article_media_attributed_author_read on public.article_media for select to authenticated
  using (exists (select 1 from public.article_attributions aa
                  where aa.article_id = article_media.article_id and aa.author_id = (select auth.uid())));

create policy revisions_attributed_author_read on public.article_revisions for select to authenticated
  using (exists (select 1 from public.article_attributions aa
                  where aa.article_id = article_revisions.article_id and aa.author_id = (select auth.uid())));

-- The flag has to travel with the submission: setting it afterwards would leave a
-- window where the story is credited, and a reporter who believes they filed
-- anonymously must never be wrong about it. The overload is dropped rather than
-- replaced because Postgres would otherwise keep the nine-argument version
-- callable alongside this one.
drop function if exists public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid);

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
  p_is_anonymous boolean default false
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
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select role, reporter_tier into actor_role, actor_tier from public.user_roles where user_id = actor;
  if actor_role not in ('reporter', 'moderator', 'admin') then raise exception 'প্রতিবেদন জমা দিতে রিপোর্টার অনুমতি প্রয়োজন' using errcode = '42501'; end if;
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
  loop
    attempt := attempt + 1;
    begin
      insert into public.articles (author_id, category_id, slug, title, excerpt, body, hero_media_key, status, published_at, is_anonymous)
      values (case when anonymous then null else actor end, category, public.allocate_article_slug(p_title), trim(p_title), trim(p_excerpt), trim(p_body), hero_text,
        case when actor_role = 'reporter' and actor_tier = 'junior' then 'pending'::public.article_status else 'published'::public.article_status end,
        case when actor_role = 'reporter' and actor_tier = 'junior' then null else now() end,
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
    insert into public.article_attributions (article_id, author_id) values (created.id, actor);
    insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
      values (actor, 'submit_anonymous_article', created.id, 'নাম প্রকাশে অনিচ্ছুক', jsonb_build_object('title', created.title, 'status', created.status));
  end if;
  -- The fee follows the reporter, not the byline, so an anonymous story still pays out.
  if created.status = 'published' then perform public.add_article_earning(created.id, actor); end if;
  return created;
end;
$$;
revoke all on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean) from public, anon;
grant execute on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean) to authenticated;

-- The self-approval guard used to read author_id directly, so an anonymous story
-- would have slipped past it: a moderator could have approved their own report.
-- Every consumer below resolves the owner through the attribution instead.
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
  if target.id is null or target.status <> 'pending' then raise exception 'প্রতিবেদনটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if owner_id = actor and p_decision = 'approve' then raise exception 'নিজের প্রতিবেদন নিজে অনুমোদন করা যাবে না' using errcode = '42501'; end if;
  logged_action := case when p_decision = 'approve' then 'approve_article' else 'reject_article' end;
  update public.articles set
    status = case when p_decision = 'approve' then 'published'::public.article_status else 'rejected'::public.article_status end,
    published_at = case when p_decision = 'approve' then now() else null end,
    rejected_at = case when p_decision = 'reject' then now() else null end,
    rejection_reason = case when p_decision = 'reject' then trim(p_reason) else null end
    where id = p_article_id returning * into updated;
  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason)
    values (actor, logged_action, p_article_id, owner_id, trim(p_reason));
  if p_decision = 'approve' then perform public.add_article_earning(p_article_id, owner_id); end if;
  return updated;
end;
$$;

-- The admin edit trail named the reporter straight off the row, which is null for an
-- anonymous story. The desk is the one party allowed to know, so it records the
-- attribution rather than dropping the link to the reporter.
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
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সম্পাদনার কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null or target.status <> 'published' then raise exception 'প্রকাশিত প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  select coalesce(max(version), 0) + 1 into next_version
    from public.article_revisions where article_id = p_article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version, target.title, target.excerpt, target.body, trim(p_reason));
  update public.articles set title = trim(p_title), excerpt = trim(p_excerpt), body = trim(p_body)
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
begin
  select role, reporter_tier into actor_role, actor_tier from public.user_roles where user_id = actor;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then raise exception 'সম্পাদনার কারণ আবশ্যক (৩–৫০০ অক্ষর)'; end if;
  select * into target from public.articles where id = p_article_id for update;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if target.id is null or owner_id is distinct from actor or target.status <> 'published' then raise exception 'প্রকাশিত নিজের প্রতিবেদন সম্পাদনা করার অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if actor_role not in ('admin', 'moderator') and not (actor_role = 'reporter' and actor_tier = 'executive') then raise exception 'এই রিপোর্টার স্তরে প্রকাশিত প্রতিবেদন সম্পাদনা করা যাবে না' using errcode = '42501'; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.article_revisions where article_id = p_article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version, target.title, target.excerpt, target.body, trim(p_reason));
  update public.articles set title = trim(p_title), excerpt = trim(p_excerpt), body = trim(p_body)
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

-- The first-withdrawal gate counts the reporter's published work. Anonymous
-- stories are still their work, so they have to count or the reporter would be
-- pushed into publishing under their own name to reach the threshold.
create or replace function public.request_withdrawal(p_amount_tk integer, p_method text, p_payout_number text)
returns public.withdrawals language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  details public.profile_details;
  completion integer;
  available integer;
  prior_paid integer;
  published_count integer;
  result public.withdrawals;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  if p_amount_tk < 3000 then raise exception 'সর্বনিম্ন উত্তোলন ৳৩,০০০'; end if;
  if p_method not in ('bkash', 'nagad') then raise exception 'বিকাশ বা নগদ নির্বাচন করুন'; end if;
  select * into details from public.profile_details where user_id = actor for update;
  completion := public.profile_completion_for(actor);
  -- '%%' because RAISE treats a bare % in the message as a format placeholder:
  -- a literal "১০০%" here is a parse error ("too few parameters specified for RAISE").
  if completion <> 100 then raise exception 'টাকা তুলতে প্রোফাইল ১০০%% সম্পূর্ণ হতে হবে'; end if;
  if details.payout_method <> p_method or details.payout_number <> trim(p_payout_number) then raise exception 'পেমেন্টের তথ্য আপনার প্রোফাইলে সংরক্ষিত তথ্যের সঙ্গে মিলতে হবে'; end if;
  if exists (select 1 from public.withdrawals where user_id = actor and status = 'pending') then raise exception 'আগের উত্তোলনের অনুরোধ নিষ্পত্তি হওয়া পর্যন্ত অপেক্ষা করুন'; end if;
  select count(*) into prior_paid from public.withdrawals where user_id = actor and status = 'paid';
  if prior_paid = 0 then
    select count(*) into published_count from public.articles a
      where a.status = 'published'
        and (a.author_id = actor
             or exists (select 1 from public.article_attributions aa where aa.article_id = a.id and aa.author_id = actor));
    if published_count < 35 then raise exception 'প্রথম উত্তোলনের আগে অন্তত ৩৫টি প্রকাশিত প্রতিবেদন প্রয়োজন (এখন %)', published_count; end if;
  end if;
  select coalesce(sum(amount_tk), 0)::integer into available from public.earnings_ledger
    where user_id = actor and entry_type in ('article_earning_available', 'profile_release', 'withdrawal_reserve', 'withdrawal_refund', 'manual_adjustment');
  if available < p_amount_tk then raise exception 'আপনার উত্তোলনযোগ্য ব্যালেন্স যথেষ্ট নয়'; end if;
  insert into public.withdrawals (user_id, amount_tk, method, payout_number_snapshot)
    values (actor, p_amount_tk, p_method, trim(p_payout_number)) returning * into result;
  insert into public.earnings_ledger (user_id, withdrawal_id, entry_type, amount_tk, reason)
    values (actor, result.id, 'withdrawal_reserve', -p_amount_tk, 'উত্তোলনের অনুরোধের জন্য সংরক্ষিত');
  return result;
end;
$$;

-- Search used an inner join to profiles, which would have dropped every anonymous
-- story out of the results. The left join keeps them, with a null credit.
drop function if exists public.search_public_articles(text, integer);

create or replace function public.search_public_articles(p_query text, p_limit integer default 30)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  body text,
  status public.article_status,
  author_id uuid,
  hero_media_key text,
  published_at timestamptz,
  created_at timestamptz,
  is_anonymous boolean,
  category jsonb,
  profiles jsonb
)
language sql stable security invoker
set search_path = ''
as $$
  with terms as (
    select nullif(trim(coalesce(p_query, '')), '') as q
  )
  select a.id, a.slug, a.title, a.excerpt, a.body, a.status, a.author_id, a.hero_media_key,
         a.published_at, a.created_at, a.is_anonymous,
         jsonb_build_object('slug', c.slug, 'title_bn', c.title_bn) as category,
         case when p.id is null then null
              else jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url) end as profiles
  from public.articles a
  join public.categories c on c.id = a.category_id
  left join public.profiles p on p.id = a.author_id
  cross join terms
  where a.status = 'published'
    and terms.q is not null
    and a.search_document @@ plainto_tsquery('simple', terms.q)
  order by ts_rank(a.search_document, plainto_tsquery('simple', terms.q)) desc, a.published_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 50))
$$;

revoke all on function public.search_public_articles(text, integer) from public;
grant execute on function public.search_public_articles(text, integer) to anon, authenticated;

commit;
