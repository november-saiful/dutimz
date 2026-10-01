-- A 300-character bio, and reader control over what a public profile shows.
--
-- The public profile is the one place another reader learns who wrote a story, so by default it
-- shows what identifies a person -- name, username and picture -- plus the bio and their published
-- work. Everything else a member fills in for payouts (department, session, hall, residency) stays
-- private until the member chooses to show it. The choice is stored as a small jsonb of booleans and
-- read back through one SECURITY DEFINER function, because profile_details is deliberately
-- owner-only and must not be opened up just to render a public page.
begin;

alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check (char_length(bio) <= 300);

alter table public.profiles add column if not exists public_profile jsonb not null default '{}'::jsonb;
alter table public.profiles add constraint profiles_public_profile_is_object
  check (jsonb_typeof(public_profile) = 'object');

-- Fields a reader may hide or show. display_name, username and avatar_url are absent on purpose:
-- they are the identity a byline is built from and cannot be switched off.
create or replace function public.set_my_profile_visibility(p_visibility jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  allowed text[] := array['bio', 'department', 'session', 'hall_name', 'residency_status', 'published_stories'];
  unknown_key text;
  candidate_key text;
  merged jsonb;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  if p_visibility is null or jsonb_typeof(p_visibility) <> 'object' then raise exception 'প্রোফাইল দেখানোর সেটিংস সঠিক নয়'; end if;
  select candidate.key into unknown_key
    from jsonb_object_keys(p_visibility) as candidate(key)
   where candidate.key <> all (allowed) limit 1;
  if unknown_key is not null then raise exception 'অচেনা গোপনীয়তার ঘর: %', unknown_key; end if;
  for candidate_key in select jsonb_object_keys(p_visibility) loop
    if jsonb_typeof(p_visibility -> candidate_key) <> 'boolean' then
      raise exception 'গোপনীয়তার মান হ্যাঁ অথবা না হতে হবে';
    end if;
  end loop;
  select coalesce(public_profile, '{}'::jsonb) || p_visibility into merged
    from public.profiles where id = actor for update;
  if merged is null then raise exception 'প্রোফাইল পাওয়া যায়নি'; end if;
  update public.profiles set public_profile = merged, updated_at = now() where id = actor;
  return merged;
end;
$$;

-- Defaults match the product: the bio and published stories are public, the payout/residency
-- fields are not.
create or replace function public.get_my_profile_visibility()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'bio', coalesce(((select public_profile from public.profiles where id = (select auth.uid()))->>'bio')::boolean, true),
    'department', coalesce(((select public_profile from public.profiles where id = (select auth.uid()))->>'department')::boolean, false),
    'session', coalesce(((select public_profile from public.profiles where id = (select auth.uid()))->>'session')::boolean, false),
    'hall_name', coalesce(((select public_profile from public.profiles where id = (select auth.uid()))->>'hall_name')::boolean, false),
    'residency_status', coalesce(((select public_profile from public.profiles where id = (select auth.uid()))->>'residency_status')::boolean, false),
    'published_stories', coalesce(((select public_profile from public.profiles where id = (select auth.uid()))->>'published_stories')::boolean, true)
  )
$$;

-- The public read. Hidden fields come back null so the page can omit them; mandatory identity is
-- always present and `show_published_stories` tells the feed whether to render at all.
create or replace function public.get_public_profile(p_username text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  department text,
  session text,
  hall_name text,
  residency_status text,
  show_published_stories boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  profile public.profiles;
  details public.profile_details;
  visibility jsonb;
begin
  select * into profile from public.profiles where username = lower(btrim(coalesce(p_username, '')));
  if profile.id is null then return; end if;
  select * into details from public.profile_details d where d.user_id = profile.id;
  visibility := coalesce(profile.public_profile, '{}'::jsonb);
  return query select
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    case when coalesce((visibility->>'bio')::boolean, true) then nullif(profile.bio, '') else null end,
    case when coalesce((visibility->>'department')::boolean, false) then details.department else null end,
    case when coalesce((visibility->>'session')::boolean, false) then details.session else null end,
    case when coalesce((visibility->>'hall_name')::boolean, false) then details.hall_name else null end,
    case when coalesce((visibility->>'residency_status')::boolean, false) then details.residency_status else null end,
    coalesce((visibility->>'published_stories')::boolean, true);
end;
$$;

revoke all on function public.set_my_profile_visibility(jsonb) from public, anon;
revoke all on function public.get_my_profile_visibility() from public, anon;
revoke all on function public.get_public_profile(text) from public;
grant execute on function public.set_my_profile_visibility(jsonb) to authenticated;
grant execute on function public.get_my_profile_visibility() to authenticated;
grant execute on function public.get_public_profile(text) to anon, authenticated;

commit;
