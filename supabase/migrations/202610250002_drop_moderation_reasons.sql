-- Moderation without a written reason, and without an audit trail.
--
-- Every desk decision used to demand a 3–500 character reason, store that text on the row it
-- changed, and append a row to `moderation_actions` and `admin_audit_log`. The desk found the
-- prompt a tax on routine work, and nothing in the product ever read either log back: no page
-- lists them, no report sums them. Both tables and the reason columns they fed are removed here.
--
-- The decisions themselves are unchanged. Every permission check, every state transition, every
-- self-approval guard and every "a paid story cannot be erased" rule is exactly where it was.
-- Only the paperwork is gone.
begin;

-- The two logs, and every row in them. Nothing references either table, so they go without a
-- cascade: no view, no policy and no function outside this migration reads them.
drop table if exists public.moderation_actions;
drop table if exists public.admin_audit_log;

-- The corrections feed changes shape below, and a function is dropped before it is rebuilt.
drop function if exists public.list_corrections(integer);

-- The reason columns. Each one existed only to carry that text, and every one is nullable except
-- the two edit-request columns, whose NOT NULL check goes with the column itself.
alter table public.articles drop column if exists rejection_reason;
alter table public.article_revisions drop column if exists reason;
alter table public.earnings_ledger drop column if exists reason;
alter table public.reporter_applications drop column if exists review_reason;

-- A settled withdrawal still records who settled it and when; it no longer records why.
alter table public.withdrawals drop constraint if exists withdrawal_review_data;
alter table public.withdrawals drop column if exists review_reason;
alter table public.withdrawals add constraint withdrawal_review_data check (
  (status = 'pending' and reviewed_at is null)
  or (status <> 'pending' and reviewed_at is not null)
);

-- Same shape for the two correction queues: a decision still names its reviewer and its moment.
alter table public.article_edit_requests drop constraint if exists article_edit_review_data;
alter table public.article_edit_requests drop column if exists reason;
alter table public.article_edit_requests drop column if exists review_reason;
alter table public.article_edit_requests add constraint article_edit_review_data check (
  (status = 'pending' and reviewed_at is null and reviewed_by is null)
  or (status <> 'pending' and reviewed_at is not null and reviewed_by is not null)
);

alter table public.spotlight_edit_requests drop constraint if exists spotlight_edit_review_data;
alter table public.spotlight_edit_requests drop column if exists reason;
alter table public.spotlight_edit_requests drop column if exists review_reason;
alter table public.spotlight_edit_requests add constraint spotlight_edit_review_data check (
  (status = 'pending' and reviewed_at is null and reviewed_by is null)
  or (status <> 'pending' and reviewed_at is not null and reviewed_by is not null)
);

-- The public corrections feed grouped a pair of revision rows by the reason the two shared. With
-- the reason gone, the transaction timestamp is what identifies the pair: one published edit
-- writes both snapshots under the same now(), which is what the grouping was really using.
create or replace function public.list_corrections(p_limit integer default 50)
returns table (
  article_id uuid,
  slug text,
  title text,
  revision integer,
  editor_label text,
  headline_changed boolean,
  body_changed boolean,
  edited_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with edits as (
    select distinct on (r.article_id, r.created_at)
           r.article_id, r.editor_id, r.version, r.created_at
      from public.article_revisions r
      join public.articles a on a.id = r.article_id
     where a.status = 'published'
       and r.version > 1
     order by r.article_id, r.created_at, r.version desc
  )
  select e.article_id,
         a.slug,
         a.title,
         e.version,
         -- A reporter's own edits are attributed by name (their byline is already public);
         -- editorial desks stay anonymous as a desk.
         case when e.editor_id = a.author_id
              then coalesce(nullif(trim(p.display_name), ''), 'লেখক')
              else 'সম্পাদকীয় ডেস্ক' end as editor_label,
         coalesce(cur.title is distinct from prev.title, false) as headline_changed,
         coalesce(cur.body is distinct from prev.body, false) as body_changed,
         e.created_at
    from edits e
    join public.articles a on a.id = e.article_id
    join public.profiles p on p.id = e.editor_id
    left join public.article_revisions cur
      on cur.article_id = e.article_id and cur.version = e.version
    left join public.article_revisions prev
      on prev.article_id = e.article_id and prev.version = e.version - 1
   order by e.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;
revoke all on function public.list_corrections(integer) from public;
grant execute on function public.list_corrections(integer) to anon, authenticated;

-- Three functions collected overloads as their arguments grew. Every version writes to a column or
-- a table removed above, so every version goes; the single definition below is the only one left.
-- Without this, an old caller would still match an old overload and fail at runtime instead.
do $$
declare sig regprocedure;
begin
  for sig in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('submit_article', 'admin_update_article', 'submit_article_edit')
  loop
    execute format('drop function %s', sig);
  end loop;
end;
$$;

-- The rest change signature by exactly one argument, so the old one has to be named and dropped:
-- CREATE OR REPLACE would otherwise leave a second, reason-taking overload behind.
drop function if exists public.admin_adjust_balance(uuid, integer, text);
drop function if exists public.admin_award_article(uuid, integer, text);
drop function if exists public.admin_delete_article(uuid, text);
drop function if exists public.admin_set_article_publication(uuid, text, uuid, timestamptz, text);
drop function if exists public.admin_set_article_status(uuid, text, text);
drop function if exists public.admin_set_spotlight_date(uuid, timestamptz, text);
drop function if exists public.admin_set_spotlight_status(uuid, text, text);
drop function if exists public.admin_update_member(uuid, jsonb, jsonb, text);
drop function if exists public.assign_user_role(uuid, public.app_role, public.reporter_tier, text);
drop function if exists public.moderate_article(uuid, text, text);
drop function if exists public.moderate_article_edit(uuid, text, text);
drop function if exists public.moderate_comment(uuid, text, text);
drop function if exists public.moderate_spotlight_edit(uuid, text, text);
drop function if exists public.review_reporter_application(uuid, text, public.reporter_tier, text);
drop function if exists public.review_withdrawal(uuid, text, text);
drop function if exists public.submit_spotlight_edit(uuid, text, text, text);
drop function if exists public.update_own_article(uuid, text, text, text, text);
-- The member dashboard's return type loses the column, and a return type is not replaceable.
drop function if exists public.get_my_articles();

create or replace function public.admin_adjust_balance(p_user_id uuid, p_amount_tk integer)
returns public.earnings_ledger language plpgsql security definer set search_path = '' as $$
declare result public.earnings_ledger;
begin
  if not public.is_admin() then raise exception 'প্রশাসক অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_amount_tk = 0 then raise exception 'সমন্বয়ের পরিমাণ সঠিকভাবে লিখুন'; end if;
  insert into public.earnings_ledger (user_id, entry_type, amount_tk, created_by)
    values (p_user_id, 'manual_adjustment', p_amount_tk, (select auth.uid())) returning * into result;
  return result;
end;
$$;

create or replace function public.admin_award_article(
  p_article_id uuid,
  p_amount_tk integer
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
  insert into public.earnings_ledger (user_id, article_id, entry_type, amount_tk, reporter_tier_snapshot, created_by)
    values (owner_id, p_article_id, 'article_earning_available', p_amount_tk, owner_tier, actor)
    returning * into result;
  return result;
end;
$$;

create or replace function public.admin_delete_article(
  p_article_id uuid
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.articles;
begin
  if not public.is_admin() then
    raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then
    raise exception 'প্রতিবেদন পাওয়া যায়নি';
  end if;
  -- A story that has been paid cannot be erased: the ledger points at it with `on delete
  -- restrict`, because it is the author's proof of what they earned. It can only be withheld.
  if exists (select 1 from public.earnings_ledger l where l.article_id = p_article_id) then
    raise exception 'এই প্রতিবেদনে অর্থ নির্ধারিত হয়েছে; অর্থের হিসাব রক্ষার জন্য এটি স্থায়ীভাবে মুছে ফেলা যায় না — প্রকাশ থেকে সরিয়ে রাখুন';
  end if;
  delete from public.articles where id = p_article_id;
end;
$$;

create or replace function public.admin_set_article_publication(
  p_article_id uuid,
  p_byline text default 'keep',
  p_author_id uuid default null,
  p_published_at timestamptz default null
)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  target public.articles;
  result public.articles;
  previous_owner uuid;
  next_owner uuid;
  next_anonymous boolean;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if coalesce(p_byline, 'keep') not in ('keep', 'author', 'anonymous') then
    raise exception 'বাইলাইনের নির্দেশনা সঠিক নয়';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  -- Whoever the story credits today, whether that sits on its own row or in the attribution.
  previous_owner := coalesce(target.author_id,
    (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));

  next_owner := previous_owner;
  next_anonymous := coalesce(target.is_anonymous, false);
  if coalesce(p_byline, 'keep') = 'author' then
    if p_author_id is null then raise exception 'নির্বাচিত লেখকের আইডি প্রয়োজন'; end if;
    perform 1 from public.profiles where id = p_author_id;
    if not found then raise exception 'নির্বাচিত লেখকের প্রোফাইল পাওয়া যায়নি'; end if;
    next_owner := p_author_id;
    next_anonymous := false;
  elsif coalesce(p_byline, 'keep') = 'anonymous' then
    -- An anonymous byline still needs a real author on file for the fee and the audit trail,
    -- so a named author is taken when one is given and the known one is kept otherwise.
    if p_author_id is not null then
      perform 1 from public.profiles where id = p_author_id;
      if not found then raise exception 'নির্বাচিত লেখকের প্রোফাইল পাওয়া যায়নি'; end if;
      next_owner := p_author_id;
    end if;
    if next_owner is null then raise exception 'নাম প্রকাশে অনিচ্ছুক রাখতে লেখক নির্ধারণ করা প্রয়োজন'; end if;
    next_anonymous := true;
  end if;

  -- The credited row and the attribution table are two representations of the same fact and
  -- articles_author_matches_anonymity will not let them disagree, so they move together.
  update public.articles
     set author_id = case when next_anonymous then null else next_owner end,
         is_anonymous = next_anonymous,
         published_at = case when p_published_at is null then published_at else least(p_published_at, now()) end
   where id = p_article_id
   returning * into result;

  if next_anonymous then
    insert into public.article_attributions (article_id, author_id) values (p_article_id, next_owner)
      on conflict (article_id) do update set author_id = excluded.author_id;
  else
    delete from public.article_attributions where article_id = p_article_id;
  end if;

  -- The fee is deliberately left where it is: the ledger is append-only and the earning was
  -- paid for the reporting that happened, not for the byline. Re-bylining a story that was
  -- never published still pays the new author, because approval resolves the owner afresh.
  return result;
end;
$$;

create or replace function public.admin_set_article_status(
  p_article_id uuid,
  p_status text
)
returns public.articles language plpgsql security definer set search_path = '' as $$
declare
  target public.articles;
  result public.articles;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_status not in ('published', 'rejected') then
    raise exception 'প্রতিবেদন প্রকাশিত অথবা প্রত্যাখ্যাত অবস্থায় রাখা যায়';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  if target.status::text = p_status then raise exception 'প্রতিবেদনটি ইতিমধ্যে এই অবস্থায় আছে'; end if;
  update public.articles set
    status = p_status::public.article_status,
    -- The original dateline is kept when a story is withheld and restored, so re-publishing does
    -- not silently re-date reporting that happened earlier. Only a story that never had a date
    -- gets one now.
    published_at = case when p_status = 'published' then coalesce(target.published_at, now()) else target.published_at end,
    rejected_at = case when p_status = 'rejected' then now() else null end
   where id = p_article_id returning * into result;
  return result;
end;
$$;

create or replace function public.admin_set_spotlight_date(
  p_post_id uuid,
  p_created_at timestamptz
)
returns public.spotlight_posts
language plpgsql security definer set search_path = '' as $$
declare
  target public.spotlight_posts;
  result public.spotlight_posts;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_created_at is null then raise exception 'তারিখ নির্ধারণ করুন'; end if;
  select * into target from public.spotlight_posts where id = p_post_id for update;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;
  update public.spotlight_posts
     set created_at = least(p_created_at, now())
   where id = p_post_id
   returning * into result;
  return result;
end;
$$;

create or replace function public.admin_set_spotlight_status(
  p_post_id uuid,
  p_decision text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.spotlight_posts;
begin
  if not public.is_moderator_or_admin() then raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_decision not in ('hide', 'restore', 'remove') then raise exception 'সিদ্ধান্ত সঠিক নয়'; end if;
  select * into target from public.spotlight_posts where id = p_post_id for update;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;
  if p_decision = 'remove' then
    delete from public.spotlight_posts where id = p_post_id;
  else
    update public.spotlight_posts
       set status = case when p_decision = 'hide' then 'hidden' else 'visible' end
     where id = p_post_id;
  end if;
end;
$$;

create or replace function public.admin_update_article(
  p_article_id uuid,
  p_title text,
  p_excerpt text,
  p_body text,
  p_slug text default null
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
  slug_base text;
  slug_candidate text := null;
  slug_attempt integer;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  excerpt_text := coalesce(nullif(trim(coalesce(p_excerpt, '')), ''), public.derive_excerpt(p_body));

  -- A typed address is normalised exactly like a submitted one. Empty keeps the published
  -- address, so a desk edit that touches only the text never moves a working link.
  if nullif(btrim(coalesce(p_slug, '')), '') is not null then
    slug_base := public.slugify_title(p_slug);
    if slug_base is null or slug_base = '' then
      raise exception 'ঠিকানাটি ইংরেজি ছোট হরফ, সংখ্যা ও হাইফেনে লিখুন';
    end if;
    if slug_base <> target.slug then
      slug_candidate := slug_base;
      slug_attempt := 1;
      while exists (select 1 from public.articles a where a.slug = slug_candidate and a.id <> p_article_id)
            and slug_attempt < 60 loop
        slug_attempt := slug_attempt + 1;
        slug_candidate := slug_base || '-' || slug_attempt::text;
      end loop;
      if exists (select 1 from public.articles a where a.slug = slug_candidate and a.id <> p_article_id) then
        raise exception 'এই ঠিকানায় অনেক প্রতিবেদন আছে; অন্য ঠিকানা লিখুন';
      end if;
    end if;
  end if;

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
  -- Discarded inline-only rows go first: clearing the inline flag before deleting them would
  -- momentarily leave those rows attached neither way and violate the attachment-kind check.
  delete from public.article_media am
   where am.article_id = p_article_id and not am.is_gallery;
  update public.article_media am set is_inline = false
   where am.article_id = p_article_id and am.is_inline;
  update public.article_media am set is_inline = true
   where am.article_id = p_article_id
     and am.is_gallery and am.media_id = any (proposed_inline);
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
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body)
    values (p_article_id, actor, next_version, target.title, target.excerpt, target.body);
  update public.articles set title = trim(p_title), excerpt = excerpt_text, body = trim(p_body),
         slug = coalesce(slug_candidate, slug)
   where id = p_article_id returning * into result;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body)
    values (p_article_id, actor, next_version + 1, result.title, result.excerpt, result.body);
  return result;
end;
$$;

create or replace function public.admin_update_member(
  p_user_id uuid,
  p_profile jsonb default '{}'::jsonb,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  allowed_profile text[] := array['username', 'display_name', 'bio', 'avatar_url'];
  allowed_details text[] := array['department', 'session', 'du_registration_number', 'residency_status',
                                  'hall_name', 'whatsapp_number', 'whatsapp_na', 'payout_method', 'payout_number'];
  before_profile public.profiles;
  after_profile public.profiles;
  before_details public.profile_details;
  after_details public.profile_details;
  unknown_key text;
  next_username text;
  next_residency text;
  next_hall text;
  next_method text;
  next_number text;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  -- An unrecognised field is a client bug. Refusing it is what keeps a renamed or mistyped
  -- input from looking like it saved while the value was quietly dropped.
  select candidate.key into unknown_key from jsonb_object_keys(coalesce(p_profile, '{}'::jsonb)) as candidate(key)
   where candidate.key <> all (allowed_profile) limit 1;
  if unknown_key is not null then raise exception 'অচেনা প্রোফাইল ঘর: %', unknown_key; end if;
  select candidate.key into unknown_key from jsonb_object_keys(coalesce(p_details, '{}'::jsonb)) as candidate(key)
   where candidate.key <> all (allowed_details) limit 1;
  if unknown_key is not null then raise exception 'অচেনা তথ্যের ঘর: %', unknown_key; end if;

  select * into before_profile from public.profiles where id = p_user_id for update;
  if before_profile.id is null then raise exception 'সদস্যের প্রোফাইল পাওয়া যায়নি'; end if;
  select * into before_details from public.profile_details where user_id = p_user_id for update;
  if before_details.user_id is null then
    insert into public.profile_details (user_id) values (p_user_id) on conflict (user_id) do nothing;
    select * into before_details from public.profile_details where user_id = p_user_id for update;
  end if;

  -- The username is both the public URL and the handle the desk types, so a clash is reported as
  -- a sentence rather than left to surface as a unique-index violation.
  next_username := case when p_profile ? 'username' then trim(coalesce(p_profile->>'username', '')) else before_profile.username end;
  if next_username <> before_profile.username then
    if char_length(next_username) < 3 or next_username !~ '^[a-zA-Z][a-zA-Z0-9_]{2,23}$' then
      raise exception 'ইউজারনেম ৩–২৪ অক্ষরের ইংরেজি অক্ষর, সংখ্যা বা আন্ডারস্কোর দিয়ে লিখুন';
    end if;
    perform 1 from public.profiles where username = next_username and id <> p_user_id;
    if found then raise exception 'এই ইউজারনেম ইতিমধ্যে অন্য সদস্যের'; end if;
  end if;

  update public.profiles set
    username = next_username,
    display_name = case when p_profile ? 'display_name' then trim(coalesce(p_profile->>'display_name', '')) else display_name end,
    bio = case when p_profile ? 'bio' then coalesce(p_profile->>'bio', '') else bio end,
    avatar_url = case when p_profile ? 'avatar_url' then nullif(trim(p_profile->>'avatar_url'), '') else avatar_url end,
    updated_at = now()
   where id = p_user_id
   returning * into after_profile;

  -- The two combination rules are the ones a desk is most likely to trip, so they are answered
  -- in words instead of as a constraint name.
  next_residency := case when p_details ? 'residency_status' then nullif(trim(p_details->>'residency_status'), '') else before_details.residency_status end;
  next_hall := case when p_details ? 'hall_name' then nullif(trim(p_details->>'hall_name'), '') else before_details.hall_name end;
  next_method := case when p_details ? 'payout_method' then nullif(trim(p_details->>'payout_method'), '') else before_details.payout_method end;
  next_number := case when p_details ? 'payout_number' then nullif(trim(p_details->>'payout_number'), '') else before_details.payout_number end;
  if next_residency is not null and next_residency not in ('hall_resident', 'off_campus') then
    raise exception 'আবাসিক অবস্থা সঠিক নয়';
  end if;
  if next_residency = 'hall_resident' and next_hall is null then
    raise exception 'হল-আবাসিকের জন্য হলের নাম প্রয়োজন';
  end if;
  if next_method is not null and next_method not in ('bkash', 'nagad') then
    raise exception 'পেমেন্ট পদ্ধতি বিকাশ অথবা নগদ হতে হবে';
  end if;
  if (next_method is null) <> (next_number is null) then
    raise exception 'পেমেন্ট পদ্ধতি ও নম্বর একসঙ্গে দিন, অথবা দুটোই খালি রাখুন';
  end if;

  update public.profile_details set
    department = case when p_details ? 'department' then nullif(trim(p_details->>'department'), '') else department end,
    session = case when p_details ? 'session' then nullif(trim(p_details->>'session'), '') else session end,
    du_registration_number = case when p_details ? 'du_registration_number' then nullif(trim(p_details->>'du_registration_number'), '') else du_registration_number end,
    residency_status = next_residency,
    hall_name = next_hall,
    whatsapp_number = case when p_details ? 'whatsapp_number' then nullif(trim(p_details->>'whatsapp_number'), '') else whatsapp_number end,
    whatsapp_na = case when p_details ? 'whatsapp_na' then coalesce((p_details->>'whatsapp_na')::boolean, false) else whatsapp_na end,
    payout_method = next_method,
    payout_number = next_number,
    updated_at = now()
   where user_id = p_user_id
   returning * into after_details;
end;
$$;

create or replace function public.assign_user_role(
  p_user_id uuid,
  p_role public.app_role,
  p_tier public.reporter_tier
)
returns public.user_roles language plpgsql security definer set search_path = '' as $$
declare
  old public.user_roles;
  result public.user_roles;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_role = 'reporter' and p_tier is null then raise exception 'রিপোর্টারের একটি স্তর নির্বাচন করুন'; end if;
  if p_role not in ('reporter', 'moderator') and p_tier is not null then
    raise exception 'শুধু রিপোর্টার বা মডারেটরের সঙ্গে রিপোর্টার স্তর যুক্ত করা যায়';
  end if;
  select * into old from public.user_roles where user_id = p_user_id for update;
  if old.user_id is null then raise exception 'ব্যবহারকারী পাওয়া যায়নি'; end if;
  if old.role = 'admin' and p_role <> 'admin'
     and (select count(*) from public.user_roles where role = 'admin') <= 1 then
    raise exception 'শেষ প্রশাসককে পদাবনতি দেওয়া যাবে না';
  end if;
  update public.user_roles
     set role = p_role, reporter_tier = p_tier, assigned_by = (select auth.uid()), updated_at = now()
   where user_id = p_user_id returning * into result;
  return result;
end;
$$;

create or replace function public.bootstrap_admin_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured text[] := public.bootstrap_admin_list();
  caller uuid := (select auth.uid());
  target_ids uuid[];
  target_id uuid;
  target_name text;
  target_avatar text;
  promoted integer := 0;
begin
  if coalesce(array_length(configured, 1), 0) = 0 then return 0; end if;

  -- auth.users is the source of truth for the caller's own address: it cannot be chosen by the
  -- client, unlike a claim in a token.
  if caller is not null and not exists (
    select 1 from auth.users u where u.id = caller and lower(coalesce(u.email, '')) = any (configured)
  ) then
    return 0;
  end if;

  -- The addresses are resolved first, so the loop below never reads a table it is also
  -- writing to.
  select coalesce(array_agg(u.id), '{}'::uuid[])
    into target_ids
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
   where lower(coalesce(u.email, '')) = any (configured)
     and (caller is null or u.id = caller)
     and coalesce(r.role, 'reader'::public.app_role) <> 'admin';

  foreach target_id in array target_ids loop
    select left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), 80),
           left(u.raw_user_meta_data ->> 'avatar_url', 2048)
      into target_name, target_avatar
      from auth.users u
     where u.id = target_id;

    -- Accounts that signed in before this migration already have these rows; the inserts keep
    -- the function correct for any account that somehow lacks them, and satisfy the foreign
    -- key from user_roles to profiles.
    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      target_id,
      'reader_' || replace(left(target_id::text, 18), '-', ''),
      target_name,
      target_avatar
    ) on conflict (id) do nothing;
    insert into public.profile_details (user_id) values (target_id) on conflict (user_id) do nothing;
    insert into public.user_roles (user_id, role, reporter_tier, assigned_by)
    values (target_id, 'admin', null, target_id)
    on conflict (user_id) do update
      set role = 'admin', reporter_tier = null, assigned_by = excluded.assigned_by, updated_at = now();

    if found then
      promoted := promoted + 1;
    end if;
  end loop;

  return promoted;
end;
$$;

create or replace function public.bootstrap_first_admin()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  expected_email text;
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target uuid := (select auth.uid());
begin
  if target is null then return false; end if;
  select value into expected_email from public.app_settings where key = 'initial_admin_email' for update;
  if coalesce(expected_email, '') = '' or lower(expected_email) <> current_email then return false; end if;
  if exists (select 1 from public.user_roles where role = 'admin') then return false; end if;
  if exists (select 1 from public.app_settings where key = 'initial_admin_claimed' and value = 'true') then return false; end if;
  update public.user_roles set role = 'admin', reporter_tier = null, assigned_by = target, updated_at = now() where user_id = target;
  update public.app_settings set value = 'true', updated_at = now() where key = 'initial_admin_claimed';
  return true;
end;
$$;

create or replace function public.get_my_articles()
returns table (
  id uuid,
  slug text,
  title text,
  status public.article_status,
  created_at timestamptz,
  published_at timestamptz,
  rejected_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.slug, a.title, a.status,
         a.created_at, a.published_at, a.rejected_at
    from public.articles a
   where a.author_id = (select auth.uid())
      or exists (select 1 from public.article_attributions aa
                  where aa.article_id = a.id and aa.author_id = (select auth.uid()))
   order by coalesce(a.published_at, a.created_at) desc
   limit 200
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata_name text;
  signup_email text := lower(coalesce(new.email, ''));
  is_bootstrap_admin boolean;
begin
  is_bootstrap_admin := signup_email = any (public.bootstrap_admin_list());
  metadata_name := left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80);
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    'reader_' || replace(left(new.id::text, 18), '-', ''),
    metadata_name,
    left(new.raw_user_meta_data ->> 'avatar_url', 2048)
  ) on conflict (id) do nothing;
  insert into public.profile_details (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role)
  values (
    new.id,
    case when is_bootstrap_admin then 'admin'::public.app_role else 'reader'::public.app_role end
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.mark_spotlight_issue(
  p_post_id uuid,
  p_status text,
  p_solver_kind text default null,
  p_solver_name text default null,
  p_solve_duration text default null,
  p_note text default null,
  p_media_ids text[] default null
)
returns public.spotlight_posts
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.spotlight_posts;
  result public.spotlight_posts;
  media text[] := '{}';
  media_key text;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  clean_name text := nullif(btrim(coalesce(p_solver_name, '')), '');
  solver text := case when p_status in ('solved', 'in_progress') then p_solver_kind else null end;
  duration text := case when p_status = 'solved' then p_solve_duration else null end;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select * into target from public.spotlight_posts where id = p_post_id for update;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;
  if target.author_id <> actor and not public.is_moderator_or_admin() then
    raise exception 'শুধু ইস্যুর লেখক বা সম্পাদকীয় ডেস্ক অবস্থা নির্ধারণ করতে পারেন' using errcode = '42501';
  end if;
  if p_status not in ('open', 'in_progress', 'solved', 'invalid') then
    raise exception 'ইস্যুর অবস্থা সঠিক নয়';
  end if;
  if p_status = 'solved' then
    if solver is null or solver not in ('authority', 'student_wing', 'volunteers', 'dean_office',
      'hall_authority', 'faculty_department', 'other') then
      raise exception 'সমাধান করেছে—কে, তা নির্বাচন করুন';
    end if;
    if duration is null or duration not in ('under_1h', '1_6h', '6_24h', '1_3d',
      '4_7d', '1_2w', '2_4w', 'over_1m') then
      raise exception 'সমাধানে কত সময় লেগেছে তা নির্বাচন করুন';
    end if;
  elsif p_status = 'in_progress' then
    if solver is null or solver not in ('authority', 'student_wing', 'volunteers', 'dean_office',
      'hall_authority', 'faculty_department', 'other') then
      raise exception 'কাজটি কে করছে, তা নির্বাচন করুন';
    end if;
  elsif p_status = 'invalid' then
    if clean_note is null or char_length(clean_note) < 3 or char_length(clean_note) > 500 then
      raise exception 'ভিত্তিহীন বা অপ্রাসঙ্গিক হিসেবে চিহ্নিত করতে কারণ লিখুন (৩–৫০০ অক্ষর)';
    end if;
  end if;
  if clean_name is not null and char_length(clean_name) > 120 then
    raise exception 'নাম ১২০ অক্ষরের মধ্যে দিন';
  end if;

  if p_media_ids is not null then
    select coalesce(array_agg(dedup.k order by dedup.ord), '{}') into media
      from (select lower(btrim(entry.k)) as k, min(entry.ord) as ord
              from unnest(p_media_ids) with ordinality as entry(k, ord)
             where entry.k is not null and btrim(entry.k) <> '' group by 1) dedup;
  end if;
  if coalesce(array_length(media, 1), 0) > 6 then raise exception 'প্রমাণে সর্বোচ্চ ৬টি ছবি যুক্ত করা যায়'; end if;
  foreach media_key in array media loop
    if media_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'প্রমাণের ছবির তালিকায় অবৈধ ফাইল আইডি আছে';
    end if;
    perform 1 from public.spotlight_media_assets m
     where m.id = media_key::uuid and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then raise exception 'প্রমাণের ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি'; end if;
  end loop;

  update public.spotlight_posts set
    issue_status = p_status,
    solver_kind = solver,
    solver_name = case when solver is null then null else clean_name end,
    solve_duration = duration,
    issue_note = clean_note,
    marked_by = actor,
    marked_at = now()
  where id = p_post_id
  returning * into result;

  delete from public.spotlight_resolution_media where post_id = p_post_id;
  if p_status = 'solved' and coalesce(array_length(media, 1), 0) > 0 then
    insert into public.spotlight_resolution_media (post_id, media_id, position)
      select p_post_id, item.key::uuid, item.ord - 1 from unnest(media) with ordinality as item(key, ord);
  end if;

  insert into public.spotlight_issue_events (
    post_id, actor_id, from_status, to_status, solver_kind, solver_name, solve_duration, note)
    values (p_post_id, actor, target.issue_status, p_status, solver, clean_name, duration, clean_note);
  return result;
end;
$$;

create or replace function public.moderate_article(p_article_id uuid, p_decision text)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  updated public.articles;
  owner_id uuid;
begin
  if not public.is_moderator_or_admin() then raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'সিদ্ধান্ত অনুমোদন অথবা প্রত্যাখ্যান হতে হবে'; end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null or target.status <> 'pending' then raise exception 'প্রতিবেদনটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if owner_id = actor and p_decision = 'approve' then raise exception 'নিজের প্রতিবেদন নিজে অনুমোদন করা যাবে না' using errcode = '42501'; end if;
  update public.articles set
    status = case when p_decision = 'approve' then 'published'::public.article_status else 'rejected'::public.article_status end,
    published_at = case when p_decision = 'approve' then coalesce(target.published_at, now()) else null end,
    rejected_at = case when p_decision = 'reject' then now() else null end
    where id = p_article_id returning * into updated;
  return updated;
end;
$$;

create or replace function public.moderate_article_edit(
  p_request_id uuid,
  p_decision text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  request public.article_edit_requests;
  target public.articles;
  updated public.articles;
  owner_id uuid;
  next_version integer;
  excerpt_text text;
  proposed_inline uuid[];
  gallery_media uuid[];
  gallery_offset integer;
  media_key uuid;
  slug_base text;
  slug_candidate text := null;
  slug_attempt integer;
begin
  if not public.is_moderator_or_admin() then
    raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'সিদ্ধান্ত অনুমোদন অথবা প্রত্যাখ্যান হতে হবে';
  end if;

  select * into request from public.article_edit_requests where id = p_request_id for update;
  if request.id is null then raise exception 'সম্পাদনার অনুরোধ পাওয়া যায়নি'; end if;
  if request.status <> 'pending' then raise exception 'এই অনুরোধটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  -- The desk may not wave through its own proposal, exactly as it may not approve its own story.
  if request.editor_id = actor then
    raise exception 'নিজের সম্পাদনার অনুরোধ নিজে অনুমোদন করা যাবে না' using errcode = '42501';
  end if;

  if p_decision = 'reject' then
    update public.article_edit_requests
       set status = 'rejected', reviewed_by = actor, reviewed_at = now()
     where id = p_request_id;
    return;
  end if;

  select * into target from public.articles where id = request.article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := public.article_author_of_record(request.article_id);
  excerpt_text := coalesce(nullif(trim(request.excerpt), ''), public.derive_excerpt(request.body));

  -- The approved address moves with the approved text. A request that proposed no address
  -- (or the address the story already carries) leaves the published link untouched.
  if request.slug is not null and nullif(btrim(request.slug), '') is not null then
    slug_base := public.slugify_title(request.slug);
    if slug_base is null or slug_base = '' then
      raise exception 'ঠিকানাটি ইংরেজি ছোট হরফ, সংখ্যা ও হাইফেনে লিখুন';
    end if;
    if slug_base <> target.slug then
      slug_candidate := slug_base;
      slug_attempt := 1;
      while exists (select 1 from public.articles a where a.slug = slug_candidate and a.id <> request.article_id)
            and slug_attempt < 60 loop
        slug_attempt := slug_attempt + 1;
        slug_candidate := slug_base || '-' || slug_attempt::text;
      end loop;
      if exists (select 1 from public.articles a where a.slug = slug_candidate and a.id <> request.article_id) then
        raise exception 'এই ঠিকানায় অনেক প্রতিবেদন আছে; অন্য ঠিকানা লিখুন';
      end if;
    end if;
  end if;

  /*
    Reconcile body-owned attachments separately from gallery attachments. Each approved body image
    must belong to the author, and only inline-only rows are discarded when the body changes.
  */
  proposed_inline := coalesce(public.body_media_ids(request.body, '/media'), '{}');
  foreach media_key in array proposed_inline loop
    perform 1 from public.media_assets m
      where m.id = media_key and m.owner_id = request.editor_id and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো লেখকের নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  select coalesce(array_agg(am.media_id order by am.position), '{}') into gallery_media
    from public.article_media am where am.article_id = request.article_id and am.is_gallery;
  if (select count(distinct attached.media_id)
        from (
          select unnest(gallery_media) as media_id
          union select unnest(proposed_inline)
          union select nullif(target.hero_media_key, '')::uuid
        ) attached
       where attached.media_id is not null) > 10 then
    raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;
  -- Discarded inline-only rows go first: clearing the inline flag before deleting them would
  -- momentarily leave those rows attached neither way and violate the attachment-kind check.
  -- Only gallery rows have their flag cleared below, so no surviving row can end up (false, false).
  delete from public.article_media am
   where am.article_id = request.article_id and not am.is_gallery;
  update public.article_media am set is_inline = false
   where am.article_id = request.article_id and am.is_inline;
  update public.article_media am set is_inline = true
   where am.article_id = request.article_id
     and am.is_gallery and am.media_id = any (proposed_inline);
  -- Preserve gallery positions; reinsert inline-only pictures in their new body order.
  for media_key in
    select item.key from unnest(proposed_inline) with ordinality as item(key, ord)
     where not exists (select 1 from public.article_media am
                        where am.article_id = request.article_id and am.media_id = item.key)
     order by item.ord
  loop
    insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
    select request.article_id, media_key, coalesce(max(am.position) + 1, 0), false, true
      from public.article_media am where am.article_id = request.article_id;
  end loop;

  select coalesce(max(version), 0) + 1 into next_version
    from public.article_revisions where article_id = request.article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body)
    values (request.article_id, actor, next_version, target.title, target.excerpt, target.body);
  update public.articles
     set title = trim(request.title), excerpt = excerpt_text, body = trim(request.body),
         slug = coalesce(slug_candidate, slug)
   where id = request.article_id returning * into updated;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body)
    values (request.article_id, actor, next_version + 1, updated.title, updated.excerpt, updated.body);

  update public.article_edit_requests
     set status = 'approved', reviewed_by = actor, reviewed_at = now()
   where id = p_request_id;
end;
$$;

create or replace function public.moderate_comment(p_comment_id uuid, p_decision text)
returns public.comments language plpgsql security definer set search_path = '' as $$
declare
  target public.comments;
  result public.comments;
  next_status public.comment_status;
begin
  if not public.is_moderator_or_admin() then raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  next_status := case p_decision when 'restore' then 'visible'::public.comment_status when 'hide' then 'hidden'::public.comment_status when 'remove' then 'removed'::public.comment_status else null end;
  if next_status is null then raise exception 'সিদ্ধান্তটি সঠিক নয়'; end if;
  select * into target from public.comments where id = p_comment_id for update;
  if target.id is null then raise exception 'মন্তব্যটি পাওয়া যায়নি'; end if;
  update public.comments set status = next_status where id = p_comment_id returning * into result;
  return result;
end;
$$;

create or replace function public.moderate_spotlight_edit(
  p_request_id uuid,
  p_decision text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  request public.spotlight_edit_requests;
  target public.spotlight_posts;
  proposed_inline uuid[];
  gallery_media uuid[];
  media_key uuid;
begin
  if not public.is_moderator_or_admin() then
    raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'সিদ্ধান্ত অনুমোদন অথবা প্রত্যাখ্যান হতে হবে';
  end if;
  select * into request from public.spotlight_edit_requests where id = p_request_id for update;
  if request.id is null then raise exception 'সম্পাদনার অনুরোধ পাওয়া যায়নি'; end if;
  if request.status <> 'pending' then raise exception 'এই অনুরোধটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  if request.editor_id = actor then
    raise exception 'নিজের সম্পাদনার অনুরোধ নিজে অনুমোদন করা যাবে না' using errcode = '42501';
  end if;

  if p_decision = 'reject' then
    update public.spotlight_edit_requests
       set status = 'rejected', reviewed_by = actor, reviewed_at = now()
     where id = p_request_id;
    return;
  end if;

  select * into target from public.spotlight_posts where id = request.post_id for update;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;

  -- Reconcile body-owned rows separately, retaining any independent gallery attachment.
  proposed_inline := coalesce(public.body_media_ids(request.description, '/spotlight/media'), '{}');
  foreach media_key in array proposed_inline loop
    perform 1 from public.spotlight_media_assets m
      where m.id = media_key and m.owner_id = request.editor_id and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো লেখকের নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  select coalesce(array_agg(pm.media_id order by pm.position), '{}') into gallery_media
    from public.spotlight_post_media pm where pm.post_id = request.post_id and pm.is_gallery;
  if (select count(distinct attached.media_id)
        from unnest(gallery_media || proposed_inline) as attached(media_id)) > 10 then
    raise exception 'একটি পোস্টে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;
  -- Same ordering as the article path: discarded inline-only rows go first, so clearing
  -- the inline flag can never leave a row attached neither way.
  delete from public.spotlight_post_media pm
   where pm.post_id = request.post_id and not pm.is_gallery;
  update public.spotlight_post_media pm set is_inline = false
   where pm.post_id = request.post_id and pm.is_inline;
  update public.spotlight_post_media pm set is_inline = true
   where pm.post_id = request.post_id
     and pm.is_gallery and pm.media_id = any (proposed_inline);
  for media_key in
    select item.key from unnest(proposed_inline) with ordinality as item(key, ord)
     where not exists (select 1 from public.spotlight_post_media pm
                        where pm.post_id = request.post_id and pm.media_id = item.key)
     order by item.ord
  loop
    insert into public.spotlight_post_media (post_id, media_id, position, is_gallery, is_inline)
    select request.post_id, media_key, coalesce(max(pm.position) + 1, 0), false, true
      from public.spotlight_post_media pm where pm.post_id = request.post_id;
  end loop;

  update public.spotlight_posts
     set title = trim(request.title), description = trim(request.description)
   where id = request.post_id;

  update public.spotlight_edit_requests
     set status = 'approved', reviewed_by = actor, reviewed_at = now()
   where id = p_request_id;
end;
$$;

create or replace function public.review_reporter_application(
  p_application_id uuid,
  p_decision text,
  p_tier public.reporter_tier
)
returns public.reporter_applications language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.reporter_applications;
  result public.reporter_applications;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'অনুমোদন অথবা প্রত্যাখ্যান নির্বাচন করুন'; end if;
  if p_decision = 'approve' and p_tier is null then raise exception 'অনুমোদনের জন্য রিপোর্টার স্তর নির্বাচন করুন'; end if;
  select * into target from public.reporter_applications where id = p_application_id for update;
  if target.id is null or target.status <> 'pending' then raise exception 'এই আবেদনটি আর অপেক্ষমাণ নেই'; end if;
  update public.reporter_applications
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         reviewed_by = actor, reviewed_at = now()
   where id = p_application_id returning * into result;
  if p_decision = 'approve' then
    update public.user_roles
       set role = 'reporter', reporter_tier = p_tier, assigned_by = actor, updated_at = now()
     where user_id = target.applicant_id;
  end if;
  return result;
end;
$$;

create or replace function public.review_withdrawal(p_withdrawal_id uuid, p_decision text)
returns public.withdrawals language plpgsql security definer set search_path = '' as $$
declare target public.withdrawals; result public.withdrawals;
begin
  if not public.is_admin() then raise exception 'প্রশাসক অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_decision not in ('paid', 'rejected') then raise exception 'সিদ্ধান্ত পরিশোধ অথবা প্রত্যাখ্যান হতে হবে'; end if;
  select * into target from public.withdrawals where id = p_withdrawal_id for update;
  if target.id is null or target.status <> 'pending' then raise exception 'এই অনুরোধটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  update public.withdrawals set status = p_decision::public.withdrawal_status, reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = p_withdrawal_id returning * into result;
  if p_decision = 'rejected' then
    insert into public.earnings_ledger (user_id, withdrawal_id, entry_type, amount_tk, created_by)
      values (target.user_id, target.id, 'withdrawal_refund', target.amount_tk, (select auth.uid()));
  end if;
  return result;
end;
$$;

create or replace function public.save_article_questionnaire(p_schema jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  field jsonb;
  condition jsonb;
  person_field jsonb;
  field_id text;
  next_version integer;
  field_position integer := 0;
  parent_position integer;
  option_value text;
  unique_option_count integer;
  unique_person_option_count integer;
begin
  if not public.is_admin() then raise exception 'শুধু প্রশাসক প্রশ্নমালা সম্পাদনা করতে পারবেন' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('article_questionnaire_version'));
  if p_schema is null or jsonb_typeof(p_schema) is distinct from 'array' then raise exception 'প্রশ্নমালাটি সঠিক তালিকা নয়'; end if;
  if jsonb_array_length(p_schema) < 1 or jsonb_array_length(p_schema) > 60 or pg_column_size(p_schema) > 65536 then raise exception 'প্রশ্নমালায় ১ থেকে ৬০টি প্রশ্ন রাখুন এবং নির্ধারিত তথ্যসীমার মধ্যে রাখুন'; end if;
  if (select count(*) from jsonb_array_elements(p_schema) as field(value) where field.value ? 'conditions' and field.value ? 'conditionMode' and field.value->>'conditionMode' not in ('any','all')) > 0 then raise exception 'প্রশ্নের শর্তের ধরন any অথবা all হতে হবে'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_schema)) <> jsonb_array_length(p_schema) then raise exception 'প্রতিটি প্রশ্নের আলাদা পরিচিতি থাকতে হবে'; end if;
  for field in select value from jsonb_array_elements(p_schema) loop
    field_id := field->>'id';
    if jsonb_typeof(field) is distinct from 'object' or coalesce(field_id,'') !~ '^[a-z][a-z0-9_]{1,59}$' or char_length(coalesce(field->>'label','')) not between 2 and 160 then raise exception 'প্রশ্নের পরিচিতি বা শিরোনাম সঠিক নয়'; end if;
    if coalesce(field->>'type','') not in ('single','multi','text','textarea','number','people') then raise exception 'প্রশ্নের ধরন সঠিক নয়'; end if;
    if jsonb_typeof(coalesce(field->'required','false'::jsonb)) <> 'boolean' or coalesce(field->>'conditionMode','any') not in ('any','all') then raise exception 'প্রশ্নের শর্ত বা আবশ্যকতার ধরন সঠিক নয়'; end if;
    if field->>'type' in ('single','multi') then
      if jsonb_typeof(field->'options') is distinct from 'array' then raise exception 'নির্বাচনী প্রশ্নে বিকল্পের তালিকা দিন'; end if;
      if jsonb_array_length(field->'options') < 2 or jsonb_array_length(field->'options') > 40 then raise exception 'নির্বাচনী প্রশ্নে ২ থেকে ৪০টি বিকল্প দিন'; end if;
      if exists (select 1 from jsonb_array_elements(field->'options') as option_row(value) where jsonb_typeof(option_row.value) is distinct from 'string') then raise exception 'প্রতিটি বিকল্প লেখা হিসেবে দিতে হবে'; end if;
      select count(distinct option_row.value) into unique_option_count from jsonb_array_elements_text(field->'options') as option_row(value);
      if unique_option_count <> jsonb_array_length(field->'options') then raise exception 'বিকল্পগুলো পুনরাবৃত্ত হতে পারবে না'; end if;
      for option_value in select jsonb_array_elements_text(field->'options') loop
        if char_length(option_value) not between 1 and 120 then raise exception 'প্রতিটি বিকল্প ১ থেকে ১২০ অক্ষরের মধ্যে লিখুন'; end if;
      end loop;
    elsif field->>'type' in ('text','textarea') and (field ? 'options' or field ? 'personFields') then
      raise exception 'লেখার প্রশ্নে বিকল্প বা ব্যক্তির ঘর দেওয়া যাবে না';
    end if;
    if jsonb_typeof(coalesce(field->'conditions','[]'::jsonb)) is distinct from 'array' then raise exception 'শর্তের তালিকা সঠিক নয়'; end if;
    if jsonb_array_length(coalesce(field->'conditions','[]'::jsonb)) > 8 then raise exception 'শর্তের তালিকা সঠিক নয়'; end if;
    if field->>'type' = 'people' then
      if jsonb_typeof(field->'personFields') is distinct from 'array' then raise exception 'ব্যক্তির পরিচিতির ঘরগুলো সঠিক নয়'; end if;
      if jsonb_array_length(field->'personFields') < 1 or jsonb_array_length(field->'personFields') > 12 then raise exception 'ব্যক্তির পরিচিতির ঘরগুলো সঠিক নয়'; end if;
      if exists (select 1 from jsonb_array_elements(field->'personFields') as pf(value) where jsonb_typeof(pf.value) is distinct from 'object') then raise exception 'ব্যক্তির পরিচিতির ঘরগুলো সঠিক নয়'; end if;
      if (select count(distinct pf.value->>'id') from jsonb_array_elements(field->'personFields') as pf(value)) <> jsonb_array_length(field->'personFields') then raise exception 'ব্যক্তির প্রতিটি পরিচিতি ঘরের আলাদা পরিচিতি থাকতে হবে'; end if;
      for person_field in select value from jsonb_array_elements(field->'personFields') loop
        if coalesce(person_field->>'id','') !~ '^[a-z][a-z0-9_]{0,39}$' or char_length(coalesce(person_field->>'label','')) not between 1 and 100 or coalesce(person_field->>'type','') not in ('text','single') then raise exception 'ব্যক্তির পরিচিতির ঘর সঠিক নয়'; end if;
        if person_field->>'type' = 'single' then
          if jsonb_typeof(person_field->'options') is distinct from 'array' then raise exception 'ব্যক্তির নির্বাচনী পরিচিতির বিকল্প সঠিক নয়'; end if;
          if jsonb_array_length(person_field->'options') < 2 or jsonb_array_length(person_field->'options') > 20 then raise exception 'ব্যক্তির নির্বাচনী পরিচিতির বিকল্প সঠিক নয়'; end if;
          if exists (select 1 from jsonb_array_elements(person_field->'options') as option_row(value) where jsonb_typeof(option_row.value) is distinct from 'string') then raise exception 'ব্যক্তির প্রতিটি বিকল্প লেখা হিসেবে দিতে হবে'; end if;
          select count(distinct option_row.value) into unique_person_option_count from jsonb_array_elements_text(person_field->'options') as option_row(value);
          if unique_person_option_count <> jsonb_array_length(person_field->'options') then raise exception 'ব্যক্তির বিকল্পগুলো পুনরাবৃত্ত হতে পারবে না'; end if;
        elsif person_field ? 'options' then raise exception 'লেখার পরিচিতি ঘরে বিকল্প দেওয়া যাবে না'; end if;
      end loop;
    end if;
  end loop;
  for field in select value from jsonb_array_elements(p_schema) loop
    select ord::integer into field_position from jsonb_array_elements(p_schema) with ordinality as e(value, ord) where value->>'id' = field->>'id';
    for condition in select value from jsonb_array_elements(coalesce(field->'conditions','[]'::jsonb)) loop
      select ord::integer into parent_position from jsonb_array_elements(p_schema) with ordinality as e(value, ord) where value->>'id' = condition->>'fieldId';
      if parent_position is null or parent_position >= field_position or jsonb_typeof(condition->'values') is distinct from 'array' then raise exception 'শর্তের প্রশ্ন বা উত্তর সঠিক নয়'; end if;
      if jsonb_array_length(condition->'values') = 0 then raise exception 'শর্তের প্রশ্ন বা উত্তর সঠিক নয়'; end if;
      if exists (select 1 from jsonb_array_elements(condition->'values') as selected_value(value) where jsonb_typeof(selected_value.value) is distinct from 'string') then raise exception 'শর্তের প্রতিটি উত্তর লেখা হিসেবে দিতে হবে'; end if;
      if not exists (
        select 1 from jsonb_array_elements(p_schema) as parent(value)
         where parent.value->>'id' = condition->>'fieldId'
           and parent.value->>'type' in ('single','multi')
           and not exists (
             select 1 from jsonb_array_elements_text(condition->'values') as selected_value(value)
              where not (coalesce(parent.value->'options','[]'::jsonb) ? selected_value.value)
           )
      ) then raise exception 'শর্তের উত্তরটি নির্ভরশীল প্রশ্নের বিকল্পের সঙ্গে মিলছে না'; end if;
    end loop;
  end loop;
  select coalesce(max(version), 0) + 1 into next_version from public.article_questionnaire_versions;
  update public.article_questionnaire_versions set active = false where active;
  insert into public.article_questionnaire_versions(version, schema, active, created_by) values (next_version, p_schema, true, actor);
  return next_version;
end;
$$;

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
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body) values (created.id, actor, 1, created.title, created.excerpt, created.body);
  if anonymous then
    insert into public.article_attributions (article_id, author_id) values (created.id, owner);
  end if;
  return created;
end;
$$;

create or replace function public.submit_article_edit(
  p_article_id uuid,
  p_title text,
  p_excerpt text,
  p_body text,
  p_slug text default null
)
returns public.article_edit_requests
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.app_role;
  target public.articles;
  owner_id uuid;
  excerpt_text text;
  inline_media uuid[];
  gallery_media uuid[];
  media_key uuid;
  slug_value text := null;
  created public.article_edit_requests;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select role into actor_role from public.user_roles where user_id = actor;
  if actor_role not in ('reporter', 'moderator', 'admin') then
    raise exception 'প্রতিবেদন সম্পাদনার অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  select * into target from public.articles where id = p_article_id;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := public.article_author_of_record(p_article_id);
  if owner_id is distinct from actor then
    raise exception 'নিজের প্রকাশিত প্রতিবেদনের সম্পাদনা অনুরোধ করা যাবে' using errcode = '42501';
  end if;
  if target.status <> 'published' then
    raise exception 'কেবল প্রকাশিত প্রতিবেদনের সম্পাদনা অনুরোধ করা যায়';
  end if;

  -- The column's own constraints, checked here so the writer reads a sentence about their
  -- correction instead of a constraint name when it is approved.
  if char_length(trim(coalesce(p_title, ''))) not between 5 and 180 then
    raise exception 'শিরোনাম ৫–১৮০ অক্ষরের মধ্যে হতে হবে';
  end if;
  if char_length(trim(coalesce(p_body, ''))) < 100 then
    raise exception 'পূর্ণ প্রতিবেদন কমপক্ষে ১০০ অক্ষরের হতে হবে';
  end if;
  if p_excerpt is not null and char_length(trim(p_excerpt)) not between 10 and 280 then
    raise exception 'সংক্ষিপ্ত পরিচিতি ১০–২৮০ অক্ষরের মধ্যে হতে হবে';
  end if;
  excerpt_text := coalesce(nullif(trim(coalesce(p_excerpt, '')), ''), public.derive_excerpt(p_body));

  -- A proposed address is normalised up front so the author reads the refusal now, not after
  -- the desk has approved everything else about the correction.
  if nullif(btrim(coalesce(p_slug, '')), '') is not null then
    slug_value := public.slugify_title(p_slug);
    if slug_value is null or slug_value = '' then
      raise exception 'ঠিকানাটি ইংরেজি ছোট হরফ, সংখ্যা ও হাইফেনে লিখুন';
    end if;
  end if;

  -- Pictures the correction places in its text. They must be this writer's own uploads: the
  -- approved body inserts them into `article_media`, which is what makes them readable once the
  -- story is public, so nothing another account uploaded may be attached this way.
  inline_media := coalesce(public.body_media_ids(p_body, '/media'), '{}');
  foreach media_key in array inline_media loop
    perform 1 from public.media_assets m
      where m.id = media_key and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  -- Refused as a sentence rather than as an index violation, so the writer is told why.
  select coalesce(array_agg(am.media_id order by am.position), '{}') into gallery_media
    from public.article_media am where am.article_id = p_article_id and am.is_gallery;
  if (select count(distinct attached.media_id)
        from (
          select unnest(gallery_media) as media_id
          union select unnest(inline_media)
          union select nullif(target.hero_media_key, '')::uuid
        ) attached
       where attached.media_id is not null) > 10 then
    raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;

  if exists (select 1 from public.article_edit_requests r
              where r.article_id = p_article_id and r.status = 'pending') then
    raise exception 'এই প্রতিবেদনের একটি সম্পাদনার অনুরোধ এখনো অনুমোদনের অপেক্ষায় আছে';
  end if;

  insert into public.article_edit_requests (article_id, editor_id, title, excerpt, body, slug)
    values (p_article_id, actor, trim(p_title), excerpt_text, trim(p_body), slug_value)
    returning * into created;
  return created;
end;
$$;

create or replace function public.submit_spotlight_edit(
  p_post_id uuid,
  p_title text,
  p_description text
)
returns public.spotlight_edit_requests
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.spotlight_posts;
  inline_media uuid[];
  gallery_media uuid[];
  media_key uuid;
  created public.spotlight_edit_requests;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select * into target from public.spotlight_posts where id = p_post_id;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;
  if target.author_id <> actor then
    raise exception 'নিজের পোস্টের সম্পাদনা অনুরোধ করা যাবে' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 5 and 180 then
    raise exception 'শিরোনাম ৫–১৮০ অক্ষরের মধ্যে হতে হবে';
  end if;
  if char_length(trim(coalesce(p_description, ''))) not between 10 and 20000 then
    raise exception 'বিবরণ ১০–২০০০০ অক্ষরের মধ্যে হতে হবে';
  end if;

  inline_media := coalesce(public.body_media_ids(p_description, '/spotlight/media'), '{}');
  foreach media_key in array inline_media loop
    perform 1 from public.spotlight_media_assets m
      where m.id = media_key and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  select coalesce(array_agg(pm.media_id order by pm.position), '{}') into gallery_media
    from public.spotlight_post_media pm where pm.post_id = p_post_id and pm.is_gallery;
  if (select count(distinct attached.media_id)
        from unnest(gallery_media || inline_media) as attached(media_id)) > 10 then
    raise exception 'একটি পোস্টে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;

  if exists (select 1 from public.spotlight_edit_requests r
              where r.post_id = p_post_id and r.status = 'pending') then
    raise exception 'এই পোস্টের একটি সম্পাদনার অনুরোধ এখনো অনুমোদনের অপেক্ষায় আছে';
  end if;

  insert into public.spotlight_edit_requests (post_id, editor_id, title, description)
    values (p_post_id, actor, trim(p_title), trim(p_description))
    returning * into created;
  return created;
end;
$$;

create or replace function public.update_own_article(
  p_article_id uuid,
  p_title text,
  p_excerpt text,
  p_body text
)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  result public.articles;
begin
  perform public.submit_article_edit(p_article_id, p_title, p_excerpt, p_body);
  select * into result from public.articles where id = p_article_id;
  return result;
end;
$$;

-- CREATE OR REPLACE keeps privileges; DROP does not. Every door that was open is reopened here,
-- and none of them opens to a signed-out visitor.
revoke all on function public.admin_adjust_balance(uuid, integer) from public, anon;
grant execute on function public.admin_adjust_balance(uuid, integer) to authenticated;
revoke all on function public.admin_award_article(uuid, integer) from public, anon;
grant execute on function public.admin_award_article(uuid, integer) to authenticated;
revoke all on function public.admin_delete_article(uuid) from public, anon;
grant execute on function public.admin_delete_article(uuid) to authenticated;
revoke all on function public.admin_set_article_publication(uuid, text, uuid, timestamptz) from public, anon;
grant execute on function public.admin_set_article_publication(uuid, text, uuid, timestamptz) to authenticated;
revoke all on function public.admin_set_article_status(uuid, text) from public, anon;
grant execute on function public.admin_set_article_status(uuid, text) to authenticated;
revoke all on function public.admin_set_spotlight_date(uuid, timestamptz) from public, anon;
grant execute on function public.admin_set_spotlight_date(uuid, timestamptz) to authenticated;
revoke all on function public.admin_set_spotlight_status(uuid, text) from public, anon;
grant execute on function public.admin_set_spotlight_status(uuid, text) to authenticated;
revoke all on function public.admin_update_article(uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_update_article(uuid, text, text, text, text) to authenticated;
revoke all on function public.admin_update_member(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.admin_update_member(uuid, jsonb, jsonb) to authenticated;
revoke all on function public.assign_user_role(uuid, public.app_role, public.reporter_tier) from public, anon;
grant execute on function public.assign_user_role(uuid, public.app_role, public.reporter_tier) to authenticated;
revoke all on function public.bootstrap_admin_accounts() from public, anon;
grant execute on function public.bootstrap_admin_accounts() to authenticated;
revoke all on function public.bootstrap_first_admin() from public, anon;
grant execute on function public.bootstrap_first_admin() to authenticated;
revoke all on function public.get_my_articles() from public, anon;
grant execute on function public.get_my_articles() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.mark_spotlight_issue(uuid, text, text, text, text, text, text[]) from public, anon;
grant execute on function public.mark_spotlight_issue(uuid, text, text, text, text, text, text[]) to authenticated;
revoke all on function public.moderate_article(uuid, text) from public, anon;
grant execute on function public.moderate_article(uuid, text) to authenticated;
revoke all on function public.moderate_article_edit(uuid, text) from public, anon;
grant execute on function public.moderate_article_edit(uuid, text) to authenticated;
revoke all on function public.moderate_comment(uuid, text) from public, anon;
grant execute on function public.moderate_comment(uuid, text) to authenticated;
revoke all on function public.moderate_spotlight_edit(uuid, text) from public, anon;
grant execute on function public.moderate_spotlight_edit(uuid, text) to authenticated;
revoke all on function public.review_reporter_application(uuid, text, public.reporter_tier) from public, anon;
grant execute on function public.review_reporter_application(uuid, text, public.reporter_tier) to authenticated;
revoke all on function public.review_withdrawal(uuid, text) from public, anon;
grant execute on function public.review_withdrawal(uuid, text) to authenticated;
revoke all on function public.save_article_questionnaire(jsonb) from public, anon;
grant execute on function public.save_article_questionnaire(jsonb) to authenticated;
revoke all on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz, text) from public, anon;
grant execute on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz, text) to authenticated;
revoke all on function public.submit_article_edit(uuid, text, text, text, text) from public, anon;
grant execute on function public.submit_article_edit(uuid, text, text, text, text) to authenticated;
revoke all on function public.submit_spotlight_edit(uuid, text, text) from public, anon;
grant execute on function public.submit_spotlight_edit(uuid, text, text) to authenticated;
revoke all on function public.update_own_article(uuid, text, text, text) from public, anon;
grant execute on function public.update_own_article(uuid, text, text, text) to authenticated;

commit;
