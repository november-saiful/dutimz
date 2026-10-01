-- The desk's two blind spots.
--
-- Money: `admin_member_records` returned the profile, the role and the completion percentage but
-- nothing about a member's wallet, even though the panel's whole finance tab is about money. The
-- only way to adjust a balance was to paste a member's UUID into a bare text box, because
-- `admin_adjust_balance` takes a raw uuid and nothing else in the panel carried one. Carrying the
-- wallet on the same row the desk already sees removes the reason the UUID box existed.
--
-- News: the panel had no story surface at all. The backend was already capable — the desk may
-- read every article whatever its status — and `admin_update_article` and
-- `admin_set_article_publication` were audited and callable, but no screen used them, and neither
-- can take a live story down. This adds that one missing desk decision as its own audited RPC.
begin;

-- Appending to the same list rather than replacing it, so the older decisions stay recorded.
alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (
  action in ('approve_article', 'reject_article', 'hide_comment', 'remove_comment', 'restore_comment',
    'assign_role', 'review_application', 'review_withdrawal', 'edit_article', 'adjust_balance',
    'set_article_publication', 'moderate_spotlight', 'set_article_status')
);

-- The wallet figures are exactly the three the member sees on their own balance page, so the desk
-- and the reader cannot be looking at different numbers: held fees not yet released, available
-- money, and what is already spoken for by a pending withdrawal.
drop function if exists public.admin_member_records(text, integer, integer);
create or replace function public.admin_member_records(p_query text default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  role public.app_role,
  reporter_tier public.reporter_tier,
  department text,
  session text,
  du_registration_number text,
  residency_status text,
  hall_name text,
  whatsapp_number text,
  whatsapp_na boolean,
  payout_method text,
  payout_number text,
  completion_percent integer,
  held_tk integer,
  available_tk integer,
  reserved_tk integer,
  created_at timestamptz,
  total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  return query
    with terms as (select nullif(trim(coalesce(p_query, '')), '') as q),
    matching as (
      select p.id
        from public.profiles p cross join terms
       where terms.q is null
          or p.display_name ilike '%' || terms.q || '%'
          or p.username ilike '%' || terms.q || '%'
    )
    select p.id, p.username, p.display_name, p.bio, p.avatar_url,
           coalesce(r.role, 'reader'::public.app_role), r.reporter_tier,
           d.department, d.session, d.du_registration_number, d.residency_status, d.hall_name,
           d.whatsapp_number, coalesce(d.whatsapp_na, false), d.payout_method, d.payout_number,
           public.profile_completion_for(p.id),
           coalesce((select sum(l.amount_tk) from public.earnings_ledger l
                      where l.user_id = p.id and l.entry_type = 'article_earning_held'), 0)::integer,
           coalesce((select sum(l.amount_tk) from public.earnings_ledger l
                      where l.user_id = p.id and l.entry_type in
                        ('article_earning_available', 'profile_release', 'withdrawal_reserve',
                         'withdrawal_refund', 'manual_adjustment')), 0)::integer,
           coalesce((select sum(w.amount_tk) from public.withdrawals w
                      where w.user_id = p.id and w.status = 'pending'), 0)::integer,
           p.created_at,
           (select count(*) from matching)
      from public.profiles p
      cross join terms
      left join public.user_roles r on r.user_id = p.id
      left join public.profile_details d on d.user_id = p.id
     -- Qualified: the RETURNS TABLE column `id` is also a PL/pgSQL variable, so a bare
     -- `select id` reads as ambiguous and aborts the whole directory listing.
     where p.id in (select matching.id from matching)
     order by p.created_at desc, p.id desc
     limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_member_records(text, integer, integer) from public, anon;
grant execute on function public.admin_member_records(text, integer, integer) to authenticated;

-- Taking a live story down, and putting one back. Approval and rejection already have a door
-- (`moderate_article`), but it refuses anything that is not still pending, so a published story
-- that has to come off the front page had no audited path at all. Only the two settled states are
-- accepted: a story is either published or withheld, never quietly returned to a queue it can no
-- longer be waiting in.
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
  -- Whoever the story credits today, so the fee reaches the person who wrote it even when the
  -- byline is held back.
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
  -- Paid for the reporting, not for the byline, and idempotent per article, so restoring a story
  -- does not pay a second time.
  if p_status = 'published' then perform public.add_article_earning(p_article_id, owner_id); end if;
  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
    values (actor, 'set_article_status', p_article_id, owner_id, trim(p_reason),
      jsonb_build_object('from', target.status::text, 'to', result.status::text));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'set_article_status', p_article_id, trim(p_reason),
      jsonb_build_object('from', target.status::text, 'to', result.status::text));
  return result;
end;
$$;
revoke all on function public.admin_set_article_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_article_status(uuid, text, text) to authenticated;

commit;
