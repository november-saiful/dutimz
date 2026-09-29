-- The desk can read and correct a member's record.
--
-- profiles is publicly readable, but profile_details is owner-only and the profiles update
-- policy only ever permits the owner. So the desk could already change a member's role and
-- balance while being unable to see or fix the record those exist for -- a misspelled hall, a
-- payout number missing a digit, a name with a typo in it. This adds the read and the write
-- behind one administrator-only pair of functions instead of widening the table policies:
-- profile_details stays owner-only, so dropping these functions would close the window again
-- rather than leave it open.
begin;

-- A stable handle changes public profile URLs and article bylines. No authenticated client,
-- including the account owner, may change it through PostgREST; admins do so only through the
-- audited admin_update_member RPC below.
revoke update (username) on public.profiles from authenticated;
revoke update (username) on public.profiles from public, anon;

-- The panel's list. Every field a member can fill is returned because the desk edits that same
-- record in place, and reading it in one call is what keeps the list and the editor in step.
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
           public.profile_completion_for(p.id), p.created_at,
           (select count(*) from matching)
      from public.profiles p
      cross join terms
      left join public.user_roles r on r.user_id = p.id
      left join public.profile_details d on d.user_id = p.id
     where p.id in (select id from matching)
     order by p.created_at desc, p.id desc
     limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_member_records(text, integer, integer) from public, anon;
grant execute on function public.admin_member_records(text, integer, integer) to authenticated;

-- The desk's edit. Both halves arrive as a patch, so a form that only changed the hall does not
-- have to resend -- and cannot accidentally blank -- everything else. An absent key means "leave
-- it alone"; a key present with an empty value means "clear it".
create or replace function public.admin_update_member(
  p_user_id uuid,
  p_profile jsonb default '{}'::jsonb,
  p_details jsonb default '{}'::jsonb,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
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
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'পরিবর্তনের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  -- An unrecognised field is a client bug. Refusing it is what keeps a renamed or mistyped
  -- input from looking like it saved while the value was quietly dropped.
  select key into unknown_key from jsonb_object_keys(coalesce(p_profile, '{}'::jsonb)) as key
   where key <> all (allowed_profile) limit 1;
  if unknown_key is not null then raise exception 'অচেনা প্রোফাইল ঘর: %', unknown_key; end if;
  select key into unknown_key from jsonb_object_keys(coalesce(p_details, '{}'::jsonb)) as key
   where key <> all (allowed_details) limit 1;
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

  -- The record change is the whole point, so both sides of it are kept: what the desk saw and
  -- what it saved, minus the bookkeeping columns that always differ.
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'update_member', p_user_id, trim(p_reason), jsonb_build_object(
      'profile_before', to_jsonb(before_profile) - 'created_at' - 'updated_at',
      'profile_after', to_jsonb(after_profile) - 'created_at' - 'updated_at',
      'details_before', to_jsonb(before_details) - 'created_at' - 'updated_at',
      'details_after', to_jsonb(after_details) - 'created_at' - 'updated_at'));
end;
$$;
revoke all on function public.admin_update_member(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.admin_update_member(uuid, jsonb, jsonb, text) to authenticated;

commit;
