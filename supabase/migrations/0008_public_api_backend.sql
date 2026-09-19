-- ============================================
-- 0008_public_api_backend.sql
--
-- Makes the public write APIs (comments, reactions, bookmarks, newsletter,
-- polls) work through Supabase instead of process-local mock stores.
--
-- Two things the original schema could not do:
--   1. `polls` stored a single `question`, so the bilingual admin form lost
--      the English question. 0006's `CREATE TABLE IF NOT EXISTS` never added
--      `votes`-safe question columns because the table already existed.
--   2. Poll results and comment reaction counters are denormalised onto rows
--      the *reader* cannot write (RLS), and `poll_votes` rows are private.
--      Both are handled here with SECURITY DEFINER functions so aggregate
--      counts stay public without exposing individual votes.
-- ============================================

-- ------------------------------------------------------------
-- POLLS: bilingual question columns
-- ------------------------------------------------------------
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS question_bn TEXT;
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS question_en TEXT;

-- Backfill from the legacy single-language column.
UPDATE public.polls
   SET question_bn = COALESCE(question_bn, question),
       question_en = COALESCE(question_en, question)
 WHERE question_bn IS NULL OR question_en IS NULL;

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment
  ON public.comment_reactions(comment_id, reaction_type);

-- ------------------------------------------------------------
-- cast_poll_vote(poll_id, option_id)
--
-- Records one vote per authenticated user (poll_votes has
-- UNIQUE(poll_id, user_id)) and increments the matching option's `votes`
-- counter inside `polls.options`, which *is* publicly readable — that is how
-- results stay visible without exposing who voted for what.
-- Returns the updated poll row as jsonb.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cast_poll_vote(
  p_poll_id UUID,
  p_option_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_poll    public.polls;
  v_matched BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_poll_id IS NULL OR p_option_id IS NULL OR p_option_id = '' THEN
    RAISE EXCEPTION 'poll and option are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_poll FROM public.polls WHERE id = p_poll_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'poll not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_poll.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'poll is closed' USING ERRCODE = '22023';
  END IF;
  IF v_poll.ends_at IS NOT NULL AND v_poll.ends_at <= now() THEN
    RAISE EXCEPTION 'poll is closed' USING ERRCODE = '22023';
  END IF;

  -- The option must exist before we record anything.
  SELECT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_poll.options) AS opt
     WHERE opt->>'id' = p_option_id
  ) INTO v_matched;
  IF NOT v_matched THEN
    RAISE EXCEPTION 'poll option not found' USING ERRCODE = 'P0002';
  END IF;

  -- One vote per user (UNIQUE(poll_id, user_id)); 23505 = already voted.
  INSERT INTO public.poll_votes (poll_id, user_id, option_id)
  VALUES (p_poll_id, v_uid, p_option_id);

  UPDATE public.polls p
     SET options = COALESCE((
           SELECT jsonb_agg(
                    CASE
                      WHEN opt->>'id' = p_option_id
                        THEN jsonb_set(
                               opt,
                               '{votes}',
                               to_jsonb(COALESCE((opt->>'votes')::int, 0) + 1)
                             )
                      ELSE opt
                    END
                    ORDER BY ord
                  )
             FROM jsonb_array_elements(p.options) WITH ORDINALITY AS t(opt, ord)
         ), p.options)
   WHERE p.id = p_poll_id;

  RETURN (SELECT to_jsonb(p) FROM public.polls p WHERE p.id = p_poll_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cast_poll_vote(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_poll_vote(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- cast_comment_reaction(comment_id, reaction)
--
-- Upserts the caller's reaction and recomputes the denormalised
-- comments.likes / comments.dislikes counters. The schema's uniqueness key
-- includes reaction_type, so without this an account could hold a like *and*
-- a dislike on the same comment; we clear the opposite reaction first.
-- Returns the updated comment row as jsonb.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cast_comment_reaction(
  p_comment_id UUID,
  p_reaction TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_comment_id IS NULL
     OR p_reaction IS NULL
     OR p_reaction NOT IN ('like', 'dislike') THEN
    RAISE EXCEPTION 'reaction must be like or dislike' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.comments WHERE id = p_comment_id) THEN
    RAISE EXCEPTION 'comment not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.comment_reactions
   WHERE comment_id = p_comment_id
     AND user_id = v_uid
     AND reaction_type <> p_reaction;

  INSERT INTO public.comment_reactions (comment_id, user_id, reaction_type)
  VALUES (p_comment_id, v_uid, p_reaction)
  ON CONFLICT (comment_id, user_id, reaction_type) DO NOTHING;

  UPDATE public.comments c
     SET likes = (
           SELECT count(*) FROM public.comment_reactions r
            WHERE r.comment_id = c.id AND r.reaction_type = 'like'
         ),
         dislikes = (
           SELECT count(*) FROM public.comment_reactions r
            WHERE r.comment_id = c.id AND r.reaction_type = 'dislike'
         ),
         updated_at = now()
   WHERE c.id = p_comment_id;

  RETURN (SELECT to_jsonb(c) FROM public.comments c WHERE c.id = p_comment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cast_comment_reaction(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_comment_reaction(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- subscribe_newsletter(email, locale)
--
-- Subscribing is anonymous, but re-subscribing after an unsubscribe needs an
-- UPDATE — and the subscribers' UPDATE policy keys off the JWT email claim,
-- which an anonymous request does not have. This RPC performs the upsert
-- (reactivating the row) and reports whether the address is new, so the API
-- can answer subscribed vs already_subscribed without a 23505 round-trip.
-- The locale rides in the JSONB `preferences` column (there is no
-- `locale` column in the live table).
-- Returns {"created": boolean}.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscribe_newsletter(
  p_email TEXT,
  p_locale TEXT DEFAULT 'bn'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email   TEXT := lower(btrim(p_email));
  v_locale  TEXT := CASE WHEN p_locale = 'en' THEN 'en' ELSE 'bn' END;
  v_existed BOOLEAN;
BEGIN
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'a valid email is required' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.newsletter_subscribers WHERE email = v_email
  ) INTO v_existed;

  INSERT INTO public.newsletter_subscribers (email, preferences, is_active)
  VALUES (
    v_email,
    jsonb_build_object('categories', '[]'::jsonb, 'frequency', 'daily', 'locale', v_locale),
    true
  )
  ON CONFLICT (email) DO UPDATE
    SET is_active = true,
        unsubscribed_at = NULL,
        preferences = public.newsletter_subscribers.preferences
                      || jsonb_build_object('locale', v_locale);

  RETURN jsonb_build_object('created', NOT v_existed);
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_newsletter(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_newsletter(TEXT, TEXT) TO anon, authenticated;
