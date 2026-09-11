-- ============================================
-- 0005_content_workflow.sql (Phase 3)
-- Storage bucket for thumbnails + workflow trigger guards.
-- ============================================

-- ------------------------------------------------------------
-- STORAGE: public `thumbnails` bucket (Appendix B)
-- Path layout: {content_id}/{timestamp}.webp
-- ------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- Reporters and above may upload; folder must start with a content UUID.
CREATE POLICY "Editors upload thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'thumbnails'
    AND public.current_role_level() >= 2
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  );

-- Everyone may read thumbnails (public bucket).
CREATE POLICY "Thumbnails are public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

-- Editors may replace/remove their own uploads; moderators manage all.
CREATE POLICY "Editors manage own thumbnails"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'thumbnails'
    AND (
      owner = auth.uid()
      OR public.current_role_level() >= 3
    )
  );

CREATE POLICY "Editors delete own thumbnails"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'thumbnails'
    AND (
      owner = auth.uid()
      OR public.current_role_level() >= 3
    )
  );

-- ------------------------------------------------------------
-- Workflow integrity: guard illegal status jumps at the DB level
-- (mirrors src/lib/content/workflow.ts).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_content_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  allowed BOOLEAN;
BEGIN
  -- New rows may start as draft or pending_review only.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'pending_review') THEN
      RAISE EXCEPTION 'Initial content status must be draft or pending_review';
    END IF;
    RETURN NEW;
  END IF;

  -- Fast path: no status change → nothing to check.
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT (
    OLD.status = 'draft' AND NEW.status IN ('pending_review', 'published')
  ) OR (
    OLD.status = 'pending_review' AND NEW.status IN ('published', 'rejected', 'draft')
  ) OR (
    OLD.status = 'published' AND NEW.status IN ('archived', 'draft')
  ) OR (
    OLD.status = 'rejected' AND NEW.status IN ('draft', 'published')
  ) OR (
    OLD.status = 'archived' AND NEW.status = 'draft'
  )
  INTO allowed;

  IF NOT COALESCE(allowed, FALSE) THEN
    RAISE EXCEPTION 'Illegal content transition % -> %', OLD.status, NEW.status;
  END IF;

  -- Stamping published_at on first publish and never unsetting it silently.
  IF NEW.status = 'published' AND OLD.published_at IS NULL THEN
    NEW.published_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_transition_guard ON public.contents;
CREATE TRIGGER content_transition_guard
  BEFORE INSERT OR UPDATE OF status ON public.contents
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_content_transition();

-- ------------------------------------------------------------
-- Version counter: monotonic bump on every update.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bump_content_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_version_bump ON public.contents;
CREATE TRIGGER content_version_bump
  BEFORE UPDATE ON public.contents
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.bump_content_version();
