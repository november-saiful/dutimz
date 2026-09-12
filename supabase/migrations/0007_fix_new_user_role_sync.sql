-- ============================================
-- 0007_fix_new_user_role_sync.sql
-- Bug: new Google OAuth users get role='visitor' in profiles but
-- raw_user_meta_data.role stays null because the sync trigger only
-- fires on UPDATE. This causes the middleware to deny access to
-- /profile for first-time logins.
--
-- Fix: set raw_user_meta_data.role during profile creation in
-- handle_new_user(), and add an INSERT trigger as a safety net.
-- ============================================

-- 1) Update handle_new_user to also set the JWT role claim on insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  candidate TEXT;
  suffix INT := 0;
BEGIN
  base_username := LOWER(
    REGEXP_REPLACE(
      COALESCE(NEW.raw_user_meta_data->>'user_name', NEW.email),
      '[^a-zA-Z0-9]+', '-', 'g'
    )
  );
  base_username := REGEXP_REPLACE(base_username, '^-+|-+$', '', 'g');
  IF base_username IS NULL OR LENGTH(base_username) < 3 THEN
    base_username := 'reader-' || SUBSTRING(NEW.id::TEXT, 1, 8);
  END IF;
  IF LENGTH(base_username) > 27 THEN
    base_username := SUBSTRING(base_username, 1, 27);
  END IF;

  candidate := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    suffix := suffix + 1;
    candidate := base_username || '-' || suffix::TEXT;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, email, avatar_url, role)
  VALUES (
    NEW.id,
    candidate,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    'visitor'
  )
  ON CONFLICT (id) DO NOTHING;

  -- KEY FIX: also set the role in raw_user_meta_data so edge middleware
  -- can read it without a DB round-trip.
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', 'visitor')
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- 2) Safety net: also sync on INSERT (not just UPDATE)
DROP TRIGGER IF EXISTS profiles_sync_role ON public.profiles;
CREATE TRIGGER profiles_sync_role
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.sync_role_to_user_metadata();
