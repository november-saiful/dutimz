-- Drop the submit_article overload the interview migration superseded.
--
-- Adding `p_interview_kind` as a trailing argument changed the function signature,
-- so CREATE OR REPLACE created a second overload instead of replacing the
-- 12-argument version. Calls that rely on defaults then match both and fail with
-- "function public.submit_article(...) is not unique" (42725). The old version is
-- gone from here on; the 13-argument one from 202610210001 is the only candidate.
drop function if exists public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz);
