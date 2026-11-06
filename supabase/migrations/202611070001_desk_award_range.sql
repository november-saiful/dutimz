-- The desk's discretionary awards widen to ৳1–20. The smallest useful nudge is one taka, and the
-- ceiling stays at twenty so neither award can move more than pocket money in one decision.
--
-- Both functions keep the bodies they had in 202611010009 and 202611010011, security definer and
-- a pinned search path included; only the whole-taka check changes from 10–20 to 1–20. Replacing
-- a function keeps its identity and privileges, but the revoke/grant pair stays explicit so the
-- guard is visible in the file that reshapes it.
begin;

create or replace function public.admin_award_bonus(p_article_id uuid, p_amount_tk integer)
returns public.earnings_ledger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  owner_id uuid;
  entry public.ledger_entry_type;
  result public.earnings_ledger;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_amount_tk is null or p_amount_tk < 1 or p_amount_tk > 20 then
    raise exception 'বোনাস ১ থেকে ২০ টাকার মধ্যে হতে হবে';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  if target.status <> 'published' then raise exception 'শুধু প্রকাশিত প্রতিবেদনে বোনাস দেওয়া যায়'; end if;
  owner_id := coalesce(target.author_id,
    (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if owner_id is null then raise exception 'প্রতিবেদনের লেখক নির্ধারণ করা যায়নি'; end if;
  entry := case when public.profile_completion_for(owner_id) = 100
           then 'bonus_earning_available'::public.ledger_entry_type
           else 'bonus_earning_held'::public.ledger_entry_type end;
  insert into public.earnings_ledger (user_id, article_id, entry_type, amount_tk, details, reporter_tier_snapshot, created_by)
    values (owner_id, p_article_id, entry, p_amount_tk,
            jsonb_build_object('version', 1, 'kind', 'desk_bonus'),
            (select r.reporter_tier from public.user_roles r where r.user_id = owner_id), actor)
    returning * into result;
  return result;
end;
$$;
revoke all on function public.admin_award_bonus(uuid, integer) from public, anon;
grant execute on function public.admin_award_bonus(uuid, integer) to authenticated;

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
  if p_amount_tk is null or p_amount_tk < 1 or p_amount_tk > 20 then
    raise exception 'জরিমানা ১ থেকে ২০ টাকার মধ্যে হতে হবে';
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

commit;
