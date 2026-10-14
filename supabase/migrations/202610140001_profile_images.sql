-- A member's own face and banner.
--
-- Every signed-in member may upload both — a reader who has never filed a story
-- still has a profile — so the two columns are writable by their owner and by
-- nobody else, and profile images get their own media table. A profile picture is
-- public identity rather than a draft, so its read gate is open to any visitor;
-- what stays closed is the R2 key table, which no client may select from at all.

begin;

alter table public.profiles
  add column cover_url text check (cover_url is null or char_length(cover_url) <= 2048);

-- `avatar_url` was already in the owner's update grant; the banner joins it. The
-- handle stays out of the list: only the audited desk RPC may change it, and a
-- column added without a grant is exactly as unwritable as it should be.
grant update (cover_url) on public.profiles to authenticated;

create table public.profile_media_assets (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  original_key text not null unique check (char_length(original_key) between 1 and 512),
  derivative_key text unique check (derivative_key is null or char_length(derivative_key) <= 512),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif')),
  original_bytes bigint not null check (original_bytes between 1 and 41943040),
  derivative_bytes bigint check (derivative_bytes is null or (derivative_bytes > 0 and derivative_bytes < original_bytes)),
  created_at timestamptz not null default now()
);

alter table public.profile_media_assets enable row level security;

-- The uploader records its own object and nothing else writes the table. There is
-- deliberately no select policy: the object key is what a client must never hold,
-- even though the picture it points at is public.
create policy profile_media_owner_insert on public.profile_media_assets for insert to authenticated
  with check (owner_id = (select auth.uid()));

revoke all on public.profile_media_assets from anon, authenticated;
grant insert on public.profile_media_assets to authenticated;

-- The media Worker resolves a profile image through this gate rather than reading
-- the private R2 key table. A profile picture is shown on a public page, so unlike
-- a news asset there is nothing to withhold from a signed-out visitor — the gate
-- exists so that resolution stays server-side and the key never travels.
create or replace function public.get_profile_media(p_media_id uuid)
returns table (
  id uuid,
  owner_id uuid,
  original_key text,
  derivative_key text,
  mime_type text,
  original_bytes bigint,
  derivative_bytes bigint
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.owner_id, m.original_key, m.derivative_key, m.mime_type, m.original_bytes, m.derivative_bytes
    from public.profile_media_assets m
   where m.id = p_media_id
$$;

revoke all on function public.get_profile_media(uuid) from public;
grant execute on function public.get_profile_media(uuid) to anon, authenticated;

-- The public read gains the banner and the role. Both are always public — like the
-- name and the avatar, a cover is not one of the fields a member is allowed to hide —
-- so they are returned as they stand rather than through the visibility switch. The
-- role belongs in the public read for the same reason the name does: the member's own
-- page and its share card introduce them as "DUTIMZ Reporter" rather than as an
-- anonymous member, and `user_roles` itself stays readable only by its owner and the
-- desk, so nothing else can ask for it. A function's OUT columns cannot be changed in
-- place, so it is dropped and rebuilt; the grant goes with the drop and is re-made
-- below.
drop function if exists public.get_public_profile(text);

create or replace function public.get_public_profile(p_username text)
returns table (
  id uuid,
  username text,
  role text,
  display_name text,
  avatar_url text,
  cover_url text,
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
  select * into profile from public.profiles p where p.username = lower(btrim(coalesce(p_username, '')));
  if profile.id is null then return; end if;
  select * into details from public.profile_details d where d.user_id = profile.id;
  visibility := coalesce(profile.public_profile, '{}'::jsonb);
  return query select
    profile.id,
    profile.username,
    -- A member with no role row has never been given a newsroom job: the read says so
    -- by returning null, and the label turns that into "Member".
    (select r.role::text from public.user_roles r where r.user_id = profile.id),
    profile.display_name,
    profile.avatar_url,
    profile.cover_url,
    case when coalesce((visibility->>'bio')::boolean, true) then nullif(profile.bio, '') else null end,
    case when coalesce((visibility->>'department')::boolean, false) then details.department else null end,
    case when coalesce((visibility->>'session')::boolean, false) then details.session else null end,
    case when coalesce((visibility->>'hall_name')::boolean, false) then details.hall_name else null end,
    case when coalesce((visibility->>'residency_status')::boolean, false) then details.residency_status else null end,
    coalesce((visibility->>'published_stories')::boolean, true);
end;
$$;

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated;

commit;
