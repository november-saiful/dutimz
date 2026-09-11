-- ============================================
-- PHASE 2: AUTH INTEGRATION
-- 1. Auto-create public.profiles row on sign-up (Google OAuth).
-- 2. Keep updated_at fresh on profiles.
-- 3. Keep auth.users.raw_user_meta_data.role in sync with profiles.role so
--    edge middleware can authorize without a DB round-trip.
-- 4. Harden profile RLS: prevent users from escalating their own role.
-- ============================================

-- ---------- 1. Auto-create profile on sign-up ----------
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
  -- Derive a username from the Google profile (email local-part or name).
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- 2. updated_at trigger ----------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 3. Mirror role into JWT user metadata ----------
CREATE OR REPLACE FUNCTION public.sync_role_to_user_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', NEW.role::TEXT)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_role ON public.profiles;
CREATE TRIGGER profiles_sync_role
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.sync_role_to_user_metadata();

-- ---------- 4. Harden profiles RLS ----------
-- Replace the blanket "Users can update own profile" policy with one that
-- blocks self-service role/verification changes. Admins keep full control
-- via the existing "Admins manage profiles" policy.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile (not role)"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND is_verified = (SELECT p.is_verified FROM public.profiles p WHERE p.id = auth.uid())
  );
