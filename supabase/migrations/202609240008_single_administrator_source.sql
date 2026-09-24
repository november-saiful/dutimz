-- Migration 007 introduced app_settings.bootstrap_admin_emails but kept the old
-- initial_admin_email key as a second source, so an installation could silently have two
-- administrator lists that disagree — and the value that is not the list is invisible in the
-- release log. This migration removes the second source: the legacy address is folded into the
-- list when it is a valid address that is not already there, then the retired keys are dropped.
--
-- Nothing else reads them. bootstrap_admin_list() is the single accessor, and both
-- handle_new_user() and bootstrap_admin_accounts() go through it, so no other change is needed.
begin;

insert into public.app_settings (key, value) values ('bootstrap_admin_emails', '')
on conflict (key) do nothing;

-- The accessor is narrowed to the list key *before* the legacy value is folded in, otherwise
-- the old function (which also reads initial_admin_email) would report the legacy address as
-- already present and the fold below would never append it.
create or replace function public.bootstrap_admin_list()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct lower(btrim(entry))), '{}'::text[])
  from (
    select unnest(string_to_array(coalesce(value, ''), ',')) as entry
    from public.app_settings
    where key = 'bootstrap_admin_emails'
  ) configured
  where btrim(entry) <> '' and position('@' in entry) > 1
$$;

-- Keep an installation's existing owner instead of dropping the address on the floor. An empty
-- or malformed value contributes nothing, and an address already in the list is not repeated.
update public.app_settings as settings
   set value = settings.value || ',' || legacy.value,
       updated_at = now()
  from (
    select btrim(value) as value from public.app_settings where key = 'initial_admin_email'
  ) as legacy
 where settings.key = 'bootstrap_admin_emails'
   and legacy.value <> ''
   and position('@' in legacy.value) > 1
   and lower(legacy.value) <> all (public.bootstrap_admin_list());

delete from public.app_settings where key in ('initial_admin_email', 'initial_admin_claimed');

commit;
