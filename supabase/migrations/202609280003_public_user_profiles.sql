begin;

-- The auth trigger creates these rows for new signups. Backfill any accounts that
-- predate the trigger (or were created while it was unavailable) so every user
-- has a stable, public username and the associated private profile record.
insert into public.profiles (id, username, display_name, avatar_url)
select
  u.id,
  'reader_' || replace(left(u.id::text, 18), '-', ''),
  left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), 80),
  left(u.raw_user_meta_data ->> 'avatar_url', 2048)
from auth.users u
on conflict (id) do nothing;

insert into public.profile_details (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'reader'::public.app_role from auth.users u
on conflict (user_id) do nothing;

commit;
