-- The desk's penalty: ৳10–20 whole taka docked from a story's owner when the story is judged to
-- deserve less than it earned.
--
-- `admin_apply_penalty` is a security-definer RPC gated on is_admin(). The row is negative and
-- lands in the available money at once — a punishment is not something a 100% profile unlocks —
-- so every available-money sum (the member's wallet, the withdrawal check, the desk's directory)
-- learns the type, and the ledger's article-reference rule gains a branch that only `penalty`
-- may be a negative, article-referenced row.
begin;

-- The article-reference rule learns the penalty: the one article-referenced type that is negative.
alter table public.earnings_ledger drop constraint if exists ledger_article_reference;
alter table public.earnings_ledger add constraint ledger_article_reference check (
  (entry_type in ('article_earning_available', 'article_earning_held',
                  'view_earning_available', 'view_earning_held',
                  'bonus_earning_available', 'bonus_earning_held')
    and article_id is not null and withdrawal_id is null and amount_tk > 0)
  or (entry_type = 'penalty'
    and article_id is not null and withdrawal_id is null and amount_tk < 0)
  or (entry_type = 'profile_release'
    and article_id is not null and withdrawal_id is null and amount_tk > 0 and released_from is not null)
  or (entry_type not in ('article_earning_available', 'article_earning_held',
                         'view_earning_available', 'view_earning_held',
                         'bonus_earning_available', 'bonus_earning_held',
                         'penalty', 'profile_release')
    and article_id is null)
);

-- The desk's deduction. Whole taka between 10 and 20, published stories only, docked from the
-- story's owner. The row is negative, so the total balance falls by exactly the amount entered;
-- like the manual adjustment, it may take a balance below zero, which simply blocks withdrawal
-- until new earnings arrive.
create or replace function public.admin_apply_penalty(p_article_id uuid, p_amount_tk integer)
returns public.earnings_ledger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  owner_id uuid;
  result public.earnings_ledger;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_amount_tk is null or p_amount_tk < 10 or p_amount_tk > 20 then
    raise exception 'জরিমানা ১০ থেকে ২০ টাকার মধ্যে হতে হবে';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  if target.status <> 'published' then raise exception 'শুধু প্রকাশিত প্রতিবেদনে জরিমানা দেওয়া যায়'; end if;
  owner_id := coalesce(target.author_id,
    (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if owner_id is null then raise exception 'প্রতিবেদনের লেখক নির্ধারণ করা যায়নি'; end if;
  insert into public.earnings_ledger (user_id, article_id, entry_type, amount_tk, details, reporter_tier_snapshot, created_by)
    values (owner_id, p_article_id, 'penalty', -p_amount_tk,
            jsonb_build_object('version', 1, 'kind', 'desk_penalty'),
            (select r.reporter_tier from public.user_roles r where r.user_id = owner_id), actor)
    returning * into result;
  return result;
end;
$$;
revoke all on function public.admin_apply_penalty(uuid, integer) from public, anon;
grant execute on function public.admin_apply_penalty(uuid, integer) to authenticated;

-- The member's own wallet page learns the penalty money.
create or replace function public.get_my_wallet()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'held', coalesce((
      select sum(held.amount_tk) from public.earnings_ledger held
       where held.user_id = (select auth.uid())
         and held.entry_type in ('article_earning_held', 'view_earning_held', 'bonus_earning_held')
         and not exists (
           select 1 from public.earnings_ledger released
            where released.released_from = held.id
              and released.entry_type = 'profile_release'
         )
    ), 0),
    'available', coalesce((
      select sum(amount_tk) from public.earnings_ledger
       where user_id = (select auth.uid())
         and entry_type in ('article_earning_available', 'view_earning_available',
                            'bonus_earning_available', 'penalty',
                            'profile_release', 'withdrawal_reserve', 'withdrawal_refund', 'manual_adjustment')
    ), 0),
    'reserved', coalesce((
      select sum(amount_tk) from public.withdrawals
       where user_id = (select auth.uid()) and status = 'pending'
    ), 0)
  )
$$;

-- The withdrawal balance check learns the penalty money.
create or replace function public.request_withdrawal(p_amount_tk integer, p_method text, p_payout_number text)
returns public.withdrawals language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  details public.profile_details;
  completion integer;
  available numeric;
  prior_paid integer;
  published_count integer;
  result public.withdrawals;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  if p_amount_tk < 3000 then raise exception 'সর্বনিম্ন উত্তোলন ৳৩,০০০'; end if;
  if p_method not in ('bkash', 'nagad') then raise exception 'বিকাশ বা নগদ নির্বাচন করুন'; end if;
  select * into details from public.profile_details where user_id = actor for update;
  completion := public.profile_completion_for(actor);
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
  select coalesce(sum(amount_tk), 0) into available from public.earnings_ledger
    where user_id = actor and entry_type in ('article_earning_available', 'view_earning_available',
                                             'bonus_earning_available', 'penalty',
                                             'profile_release', 'withdrawal_reserve', 'withdrawal_refund', 'manual_adjustment');
  if available < p_amount_tk then raise exception 'আপনার উত্তোলনযোগ্য ব্যালেন্স যথেষ্ট নয়'; end if;
  insert into public.withdrawals (user_id, amount_tk, method, payout_number_snapshot)
    values (actor, p_amount_tk, p_method, trim(p_payout_number)) returning * into result;
  insert into public.earnings_ledger (user_id, withdrawal_id, entry_type, amount_tk)
    values (actor, result.id, 'withdrawal_reserve', -p_amount_tk);
  return result;
end;
$$;
revoke all on function public.request_withdrawal(integer, text, text) from public, anon;
grant execute on function public.request_withdrawal(integer, text, text) to authenticated;

-- The member directory the desk reads gains the penalty in its available figure.
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
                      where l.user_id = p.id and l.entry_type in ('article_earning_held', 'view_earning_held', 'bonus_earning_held')
                        and not exists (select 1 from public.earnings_ledger rel
                                         where rel.released_from = l.id and rel.entry_type = 'profile_release')), 0)::numeric,
           coalesce((select sum(l.amount_tk) from public.earnings_ledger l
                      where l.user_id = p.id and l.entry_type in
                        ('article_earning_available', 'view_earning_available', 'bonus_earning_available',
                         'penalty', 'profile_release', 'withdrawal_reserve', 'withdrawal_refund', 'manual_adjustment')), 0)::numeric,
           coalesce((select sum(w.amount_tk) from public.withdrawals w
                      where w.user_id = p.id and w.status = 'pending'), 0)::integer,
           -- auth.users.email is varchar(255); the declared column is text, and plpgsql
           -- validates RETURN QUERY columns by exact type, so the cast is load-bearing.
           a.email::text,
           a.deleted_at is not null,
           p.created_at,
           (select count(*) from matching)
      from public.profiles p
      cross join terms
      left join auth.users a on a.id = p.id
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

commit;
