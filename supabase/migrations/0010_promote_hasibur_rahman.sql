-- Promote the existing Hasibur Rahman account to administrator.
-- The role-sync trigger from 0004_auth.sql also refreshes the JWT metadata.
DO $$
DECLARE
  matching_users INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO matching_users
    FROM public.profiles
   WHERE LOWER(TRIM(display_name)) = 'hasibur rahman';

  IF matching_users <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one profile named Hasibur Rahman, found %',
      matching_users;
  END IF;

  UPDATE public.profiles
     SET role = 'admin'::user_role,
         updated_at = NOW()
   WHERE LOWER(TRIM(display_name)) = 'hasibur rahman';
END
$$;
