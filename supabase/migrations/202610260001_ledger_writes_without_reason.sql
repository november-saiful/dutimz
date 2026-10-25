-- The ledger lost its `reason` column in 202610250002, but three functions still wrote to it: the
-- two triggers that release held earnings when a profile reaches 100%, and the withdrawal request
-- that reserves the money. A PL/pgSQL body is only parsed when it runs, so the migration applied
-- cleanly and every one of these would have failed at runtime — the withdrawal one on every
-- request, the triggers on every profile that completes.
--
-- `bootstrap_first_admin` was retired in 202609240007, when the configurable administrator list
-- replaced it. 202610250002 rebuilt it by accident, because the last definition on file was still
-- the retired one. It is dropped again here: a function that lets its caller claim the
-- administrator role must not be callable.
begin;

create or replace function public.release_held_earnings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.profile_completion_for(new.user_id) = 100 then
    insert into public.earnings_ledger (
      user_id, article_id, entry_type, amount_tk, reporter_tier_snapshot
    )
    select held.user_id, held.article_id, 'profile_release', held.amount_tk,
           held.reporter_tier_snapshot
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
      user_id, article_id, entry_type, amount_tk, reporter_tier_snapshot
    )
    select held.user_id, held.article_id, 'profile_release', held.amount_tk,
           held.reporter_tier_snapshot
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
  insert into public.earnings_ledger (user_id, withdrawal_id, entry_type, amount_tk)
    values (actor, result.id, 'withdrawal_reserve', -p_amount_tk);
  return result;
end;
$$;
revoke all on function public.request_withdrawal(integer, text, text) from public, anon;
grant execute on function public.request_withdrawal(integer, text, text) to authenticated;

drop function if exists public.bootstrap_first_admin();

commit;
