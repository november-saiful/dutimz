begin;

-- The desk now manages the sign-in address itself, so the member directory carries each
-- member's GoTrue email and whether the account has been closed by the desk. Both live in
-- auth.users, which no public role may read — but this function is security definer and already
-- gated on is_admin(), so the two columns ride the same door the rest of the directory uses.
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
  held_tk numeric,
  available_tk numeric,
  reserved_tk integer,
  email text,
  auth_deleted boolean,
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
                      where l.user_id = p.id and l.entry_type in ('article_earning_held', 'view_earning_held')
                        and not exists (select 1 from public.earnings_ledger rel
                                         where rel.released_from = l.id and rel.entry_type = 'profile_release')), 0)::numeric,
           coalesce((select sum(l.amount_tk) from public.earnings_ledger l
                      where l.user_id = p.id and l.entry_type in
                        ('article_earning_available', 'view_earning_available', 'profile_release',
                         'withdrawal_reserve', 'withdrawal_refund', 'manual_adjustment')), 0)::numeric,
           coalesce((select sum(w.amount_tk) from public.withdrawals w
                      where w.user_id = p.id and w.status = 'pending'), 0)::integer,
           a.email,
           a.deleted_at is not null,
           p.created_at,
           (select count(*) from matching)
      from public.profiles p
      cross join terms
      left join auth.users a on a.id = p.id
      left join public.user_roles r on r.user_id = p.id
      left join public.profile_details d on d.user_id = p.id
     where p.id in (select matching.id from matching)
     order by p.created_at desc, p.id desc
     limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_member_records(text, integer, integer) from public, anon;
grant execute on function public.admin_member_records(text, integer, integer) to authenticated;

commit;
