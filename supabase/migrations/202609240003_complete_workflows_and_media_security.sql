begin;

-- Profile details are intentionally optional. Completion is computed from the
-- actual applicable fields; saving a partial login prompt must never fail.
alter table public.profile_details drop constraint if exists valid_hall_status;
alter table public.profile_details drop column if exists completion_percent;

-- Keep the earnings ledger append-only. A hold remains as its original audit
-- entry and a separate release row credits each earned article exactly once.
alter table public.earnings_ledger drop constraint if exists ledger_article_reference;
alter table public.earnings_ledger add constraint ledger_article_reference check (
  (entry_type in ('article_earning_available', 'article_earning_held')
    and article_id is not null and withdrawal_id is null and amount_tk > 0)
  or (entry_type = 'profile_release'
    and article_id is not null and withdrawal_id is null and amount_tk > 0)
  or (entry_type not in ('article_earning_available', 'article_earning_held', 'profile_release')
    and article_id is null)
);
create unique index if not exists one_profile_release_per_article
  on public.earnings_ledger (article_id) where entry_type = 'profile_release';

create or replace function public.prevent_ledger_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'আয়ের ইতিহাস পরিবর্তন বা মুছে ফেলা যাবে না';
end;
$$;
create trigger earnings_ledger_append_only
  before update or delete on public.earnings_ledger
  for each row execute function public.prevent_ledger_mutation();

create or replace function public.release_held_earnings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.profile_completion_for(new.user_id) = 100 then
    insert into public.earnings_ledger (
      user_id, article_id, entry_type, amount_tk, reporter_tier_snapshot, reason
    )
    select held.user_id, held.article_id, 'profile_release', held.amount_tk,
           held.reporter_tier_snapshot, 'প্রোফাইল ১০০% সম্পূর্ণ হওয়ায় আয় ছাড়'
      from public.earnings_ledger held
     where held.user_id = new.user_id
       and held.entry_type = 'article_earning_held'
       and not exists (
         select 1 from public.earnings_ledger released
          where released.article_id = held.article_id
            and released.entry_type = 'profile_release'
       )
    on conflict (article_id) where entry_type = 'profile_release' do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.release_held_earnings_on_identity_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.profile_completion_for(new.id) = 100 then
    insert into public.earnings_ledger (
      user_id, article_id, entry_type, amount_tk, reporter_tier_snapshot, reason
    )
    select held.user_id, held.article_id, 'profile_release', held.amount_tk,
           held.reporter_tier_snapshot, 'প্রোফাইল ১০০% সম্পূর্ণ হওয়ায় আয় ছাড়'
      from public.earnings_ledger held
     where held.user_id = new.id
       and held.entry_type = 'article_earning_held'
       and not exists (
         select 1 from public.earnings_ledger released
          where released.article_id = held.article_id
            and released.entry_type = 'profile_release'
       )
    on conflict (article_id) where entry_type = 'profile_release' do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.get_my_wallet()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'held', coalesce((
      select sum(held.amount_tk) from public.earnings_ledger held
       where held.user_id = (select auth.uid())
         and held.entry_type = 'article_earning_held'
         and not exists (
           select 1 from public.earnings_ledger released
            where released.article_id = held.article_id
              and released.entry_type = 'profile_release'
         )
    ), 0),
    'available', coalesce((
      select sum(amount_tk) from public.earnings_ledger
       where user_id = (select auth.uid())
         and entry_type in ('article_earning_available', 'profile_release', 'withdrawal_reserve', 'withdrawal_refund', 'manual_adjustment')
    ), 0),
    'reserved', coalesce((
      select sum(amount_tk) from public.withdrawals
       where user_id = (select auth.uid()) and status = 'pending'
    ), 0)
  )
$$;

create or replace function public.add_article_earning(p_article_id uuid, p_author_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  author_role public.app_role;
  author_tier public.reporter_tier;
  amount integer;
  entry public.ledger_entry_type;
begin
  select r.role, r.reporter_tier into author_role, author_tier
    from public.user_roles r where r.user_id = p_author_id;
  -- Moderators are eligible only when an administrator separately assigned a tier.
  if author_role not in ('reporter', 'moderator') then return; end if;
  amount := public.reporter_fee_for_tier(author_tier);
  if amount is null then return; end if;
  entry := case when public.profile_completion_for(p_author_id) = 100
    then 'article_earning_available' else 'article_earning_held' end;
  insert into public.earnings_ledger (user_id, article_id, entry_type, amount_tk, reporter_tier_snapshot)
    values (p_author_id, p_article_id, entry, amount, author_tier)
    on conflict (article_id) where entry_type in ('article_earning_available', 'article_earning_held') do nothing;
end;
$$;

-- Roles and reporter tiers can be managed independently for moderators, but a
-- fee tier cannot be attached to a reader or an administrator.
create or replace function public.assign_user_role(
  p_user_id uuid,
  p_role public.app_role,
  p_tier public.reporter_tier,
  p_reason text
)
returns public.user_roles language plpgsql security definer set search_path = '' as $$
declare
  old public.user_roles;
  result public.user_roles;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'পদবি পরিবর্তনের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
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
  insert into public.moderation_actions (actor_id, action, target_user_id, reason, details)
    values ((select auth.uid()), 'assign_role', p_user_id, trim(p_reason),
      jsonb_build_object('old_role', old.role, 'new_role', p_role, 'old_tier', old.reporter_tier, 'new_tier', p_tier));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values ((select auth.uid()), 'assign_role', p_user_id, trim(p_reason), jsonb_build_object('role', p_role, 'tier', p_tier));
  return result;
end;
$$;

-- Reporter applications need a reviewed outcome and reason, with role assignment
-- in the same transaction as approval so the two records cannot drift apart.
alter table public.reporter_applications add column if not exists review_reason text;
alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (
  action in ('approve_article', 'reject_article', 'hide_comment', 'remove_comment', 'restore_comment',
    'assign_role', 'review_application', 'review_withdrawal', 'edit_article', 'adjust_balance')
);

create or replace function public.review_reporter_application(
  p_application_id uuid,
  p_decision text,
  p_tier public.reporter_tier,
  p_reason text
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
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'আবেদন পর্যালোচনার কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  select * into target from public.reporter_applications where id = p_application_id for update;
  if target.id is null or target.status <> 'pending' then raise exception 'এই আবেদনটি আর অপেক্ষমাণ নেই'; end if;
  update public.reporter_applications
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         reviewed_by = actor, reviewed_at = now(), review_reason = trim(p_reason)
   where id = p_application_id returning * into result;
  if p_decision = 'approve' then
    update public.user_roles
       set role = 'reporter', reporter_tier = p_tier, assigned_by = actor, updated_at = now()
     where user_id = target.applicant_id;
    insert into public.moderation_actions (actor_id, action, target_user_id, reason, details)
      values (actor, 'review_application', target.applicant_id, trim(p_reason),
        jsonb_build_object('application_id', target.id, 'decision', p_decision, 'tier', p_tier));
  else
    insert into public.moderation_actions (actor_id, action, target_user_id, reason, details)
      values (actor, 'review_application', target.applicant_id, trim(p_reason),
        jsonb_build_object('application_id', target.id, 'decision', p_decision));
  end if;
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'review_application', target.id, trim(p_reason),
      jsonb_build_object('decision', p_decision, 'tier', p_tier));
  return result;
end;
$$;

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
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সম্পাদনার কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null or target.status <> 'published' then raise exception 'প্রকাশিত প্রতিবেদন পাওয়া যায়নি'; end if;
  select coalesce(max(version), 0) + 1 into next_version
    from public.article_revisions where article_id = p_article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version, target.title, target.excerpt, target.body, trim(p_reason));
  update public.articles set title = trim(p_title), excerpt = trim(p_excerpt), body = trim(p_body)
   where id = p_article_id returning * into result;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version + 1, result.title, result.excerpt, result.body, trim(p_reason));
  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
    values (actor, 'edit_article', p_article_id, target.author_id, trim(p_reason),
      jsonb_build_object('revision', next_version + 1, 'scope', 'admin'));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'edit_article', p_article_id, trim(p_reason), jsonb_build_object('revision', next_version + 1));
  return result;
end;
$$;

-- The media worker calls this narrow gate instead of querying private R2 keys
-- from the REST table directly. Readers can resolve only live article media;
-- owners and editorial moderators may resolve their private uploads.
create or replace function public.get_media_asset(p_media_id uuid)
returns table (
  id uuid,
  owner_id uuid,
  original_key text,
  derivative_key text,
  mime_type text,
  original_bytes bigint,
  derivative_bytes bigint,
  is_public boolean
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.owner_id, m.original_key, m.derivative_key, m.mime_type,
         m.original_bytes, m.derivative_bytes,
         exists (
           select 1 from public.articles a
            where a.hero_media_key = m.id::text and a.status = 'published'
         ) as is_public
    from public.media_assets m
   where m.id = p_media_id
     and (
       m.owner_id = (select auth.uid())
       or (select public.is_moderator_or_admin())
       or exists (
         select 1 from public.articles a
          where a.hero_media_key = m.id::text and a.status = 'published'
       )
     )
$$;

revoke all on function public.prevent_ledger_mutation() from public, anon, authenticated;
revoke all on function public.review_reporter_application(uuid, text, public.reporter_tier, text) from public, anon;
revoke all on function public.admin_update_article(uuid, text, text, text, text) from public, anon;
revoke all on function public.get_media_asset(uuid) from public;
revoke all on function public.assign_user_role(uuid, public.app_role, public.reporter_tier, text) from public, anon;
grant execute on function public.review_reporter_application(uuid, text, public.reporter_tier, text),
  public.admin_update_article(uuid, text, text, text, text),
  public.assign_user_role(uuid, public.app_role, public.reporter_tier, text)
  to authenticated;
grant execute on function public.get_media_asset(uuid) to anon, authenticated;

commit;
