-- A policy expression is evaluated with the privileges of the role running the query, so a
-- policy that calls a helper function is *unusable* — not merely restrictive — for any role
-- that cannot execute that function: PostgreSQL raises 42501 and PostgREST answers 401 for the
-- entire query instead of returning the rows the policy allows.
--
-- Migration 001 revoked these three helpers from anon while the public read policies on
-- articles, comments, reactions and categories called them. The consequence was that a
-- signed-out visitor could not load a single story, comment, reaction, section list, or
-- search result: every anonymous query failed with
-- `permission denied for function is_moderator_or_admin`. Nothing about the rows changed;
-- the query was simply refused before any row was considered.
--
-- The helpers are safe to expose to signed-out callers. Each is SECURITY DEFINER with an
-- empty search_path, reads only the caller's own row in public.user_roles, and returns false
-- when there is no caller (auth.uid() is null for anon). They disclose nothing and grant
-- nothing: the policies still restrict anon to published rows, which the assertions in
-- supabase/tests/dutimiz_rls.test.sql now check directly.
begin;

grant execute on function public.is_moderator_or_admin() to anon;
grant execute on function public.is_admin() to anon;
grant execute on function public.current_app_role() to anon;

commit;
