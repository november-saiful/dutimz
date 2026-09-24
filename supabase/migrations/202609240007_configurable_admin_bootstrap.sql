-- The launch plan bootstrapped exactly one administrator: a single address in
-- app_settings.initial_admin_email, claimed once by the first matching sign-in through
-- public.bootstrap_first_admin(). DUTIMZ has more than one owner, and a single-shot switch
-- cannot express that — the second address had no route to the administrator role at all,
-- short of a hand-written INSERT into public.user_roles.
--
-- This migration replaces the one-shot claim with a configured list:
--   * app_settings.bootstrap_admin_emails holds a comma separated list of the Google
--     addresses that are administrators by policy.
--   * handle_new_user() gives a listed address the admin role in the same transaction as its
--     first sign-in, so admins do not have to race each other for one slot.
--   * public.bootstrap_admin_accounts() reconciles accounts that already exist, i.e. people
--     who signed in before the list was configured.
--   * The legacy initial_admin_email key keeps working as an extra source for the list, so an
--     installation that already set it promotes that address instead of silently losing it.
--
-- The addresses are not stored in this repository. The release workflow writes the list
-- through the Supabase management API from the BOOTSTRAP_ADMIN_EMAILS repository secret, the
-- same way the Pages Supabase credentials travel from repository variables at deploy time.
begin;

insert into public.app_settings (key, value) values ('bootstrap_admin_emails', '')
on conflict (key) do nothing;

-- The configured administrator addresses, normalised, validated and de-duplicated. Both the
-- list key and the legacy single-address key are read, so either one can be used.
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
    where key in ('bootstrap_admin_emails', 'initial_admin_email')
  ) configured
  where btrim(entry) <> '' and position('@' in entry) > 1
$$;

-- A signup still receives a reader role and an unguessable URL-safe username, except when the
-- address is one of the configured administrators.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata_name text;
  signup_email text := lower(coalesce(new.email, ''));
  is_bootstrap_admin boolean;
begin
  is_bootstrap_admin := signup_email = any (public.bootstrap_admin_list());
  metadata_name := left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80);
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    'reader_' || replace(left(new.id::text, 18), '-', ''),
    metadata_name,
    left(new.raw_user_meta_data ->> 'avatar_url', 2048)
  ) on conflict (id) do nothing;
  insert into public.profile_details (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role)
  values (
    new.id,
    case when is_bootstrap_admin then 'admin'::public.app_role else 'reader'::public.app_role end
  ) on conflict (user_id) do nothing;
  if is_bootstrap_admin then
    insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (
      new.id,
      'bootstrap_admin',
      new.id,
      'প্রাথমিক অ্যাডমিন তালিকা অনুযায়ী অ্যাডমিন ভূমিকা দেওয়া হয়েছে',
      jsonb_build_object('bootstrap', true, 'email', signup_email, 'stage', 'signup')
    );
  end if;
  return new;
end;
$$;

-- Reconciles accounts that predate the configured list, and lets a configured administrator
-- recover their own role without database access.
--
-- A signed-in caller may only ever promote its *own* listed account, so an ordinary reader
-- cannot use this function to hand out administrator rights. Called out of band (the Supabase
-- SQL editor or the management API used by the release workflow, where auth.uid() is null) it
-- reconciles every configured address. Returns how many accounts it actually changed.
create or replace function public.bootstrap_admin_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured text[] := public.bootstrap_admin_list();
  caller uuid := (select auth.uid());
  target_ids uuid[];
  target_id uuid;
  target_email text;
  target_name text;
  target_avatar text;
  promoted integer := 0;
begin
  if coalesce(array_length(configured, 1), 0) = 0 then return 0; end if;

  -- auth.users is the source of truth for the caller's own address: it cannot be chosen by the
  -- client, unlike a claim in a token.
  if caller is not null and not exists (
    select 1 from auth.users u where u.id = caller and lower(coalesce(u.email, '')) = any (configured)
  ) then
    return 0;
  end if;

  -- The addresses are resolved first, so the loop below never reads a table it is also
  -- writing to.
  select coalesce(array_agg(u.id), '{}'::uuid[])
    into target_ids
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
   where lower(coalesce(u.email, '')) = any (configured)
     and (caller is null or u.id = caller)
     and coalesce(r.role, 'reader'::public.app_role) <> 'admin';

  foreach target_id in array target_ids loop
    select lower(coalesce(u.email, '')),
           left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), 80),
           left(u.raw_user_meta_data ->> 'avatar_url', 2048)
      into target_email, target_name, target_avatar
      from auth.users u
     where u.id = target_id;

    -- Accounts that signed in before this migration already have these rows; the inserts keep
    -- the function correct for any account that somehow lacks them, and satisfy the foreign
    -- key from user_roles to profiles.
    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      target_id,
      'reader_' || replace(left(target_id::text, 18), '-', ''),
      target_name,
      target_avatar
    ) on conflict (id) do nothing;
    insert into public.profile_details (user_id) values (target_id) on conflict (user_id) do nothing;
    insert into public.user_roles (user_id, role, reporter_tier, assigned_by)
    values (target_id, 'admin', null, target_id)
    on conflict (user_id) do update
      set role = 'admin', reporter_tier = null, assigned_by = excluded.assigned_by, updated_at = now();

    if found then
      promoted := promoted + 1;
      insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
      values (
        target_id,
        'bootstrap_admin',
        target_id,
        'প্রাথমিক অ্যাডমিন তালিকা অনুযায়ী অ্যাডমিন ভূমিকা দেওয়া হয়েছে',
        jsonb_build_object('bootstrap', true, 'email', target_email)
      );
    end if;
  end loop;

  return promoted;
end;
$$;

-- The one-shot claim is fully superseded: the list assigns the role at signup, and
-- bootstrap_admin_accounts() covers accounts that already exist.
drop function if exists public.bootstrap_first_admin();

revoke all on function public.bootstrap_admin_list() from public, anon, authenticated;
revoke all on function public.bootstrap_admin_accounts() from public, anon;
grant execute on function public.bootstrap_admin_accounts() to authenticated;

commit;
