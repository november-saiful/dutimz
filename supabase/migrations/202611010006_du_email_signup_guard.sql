begin;

-- Google is the only identity provider, and a Google address becomes an account the first
-- time it signs in, so the one door into the site is the moment GoTrue inserts the new user
-- row. The guard runs right there, before any profile row exists: an address whose domain
-- does not end in du.ac.bd — the exact domain or any subdomain, e.g. mgt.du.ac.bd — never
-- becomes an account, whichever provider or flow carried it.
--
-- Insert-only on purpose. Existing accounts keep working whatever their address, and the
-- desk's manual email corrections are ordinary UPDATEs this trigger never sees.
create function public.guard_du_email_signup()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null
     and new.email !~* '^[^@]+@([[:alnum:]-]+\.)*du\.ac\.bd$' then
    raise exception 'DU_SIGNUP_DENIED: only addresses under du.ac.bd may join'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger du_email_signup_guard
  before insert on auth.users
  for each row execute function public.guard_du_email_signup();

-- A trigger runs regardless of grants; the revocation only keeps the guard from being called
-- directly, matching the convention for every function that protects a write.
revoke all on function public.guard_du_email_signup() from public, anon, authenticated;

commit;
