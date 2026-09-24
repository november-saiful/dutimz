-- The admin panel shows who is an administrator by policy, because the configured addresses are
-- the only place a stale or unexpected owner can hide: public.user_roles only shows accounts
-- that exist, and public.app_settings is not readable by any signed-in role.
--
-- The accessor returns the configured list to administrators and an empty array to everybody
-- else, so a reader cannot use it to enumerate the portal owners. The list itself is still
-- written only by the release workflow from the BOOTSTRAP_ADMIN_EMAILS secret; nothing here can
-- change it.
begin;

create or replace function public.admin_bootstrap_addresses()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select public.is_admin()) then public.bootstrap_admin_list()
    else '{}'::text[]
  end
$$;

revoke all on function public.admin_bootstrap_addresses() from public, anon;
grant execute on function public.admin_bootstrap_addresses() to authenticated;

commit;
