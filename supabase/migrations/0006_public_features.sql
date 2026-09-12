-- ============================================
-- 0006_public_features.sql (Phase 4)
-- Comments, bookmarks, newsletter, search helpers
-- ============================================

-- ------------------------------------------------------------
-- COMMENTS: nested/threaded with reactions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  author_name TEXT,              -- fallback for anonymous / deleted authors
  author_avatar TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved','pending','rejected','spam')),
  likes INT NOT NULL DEFAULT 0,
  dislikes INT NOT NULL DEFAULT 0,
  depth INT NOT NULL DEFAULT 0,  -- nesting depth (0 = top-level)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_content ON comments(content_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- ------------------------------------------------------------
-- COMMENT REACTIONS: per-user like / dislike
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('like','dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- ------------------------------------------------------------
-- BOOKMARKS: user ↔ content
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, created_at DESC);

-- ------------------------------------------------------------
-- NEWSLETTER SUBSCRIBERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'bn',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- SEARCH: trigram GIN index for Bangla + English full-text
-- Uses pg_trgm extension for LIKE/ILIKE acceleration.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Combined search vector column (kept in sync by trigger below)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_contents_search ON contents USING GIN(search_vector);

-- Trigram index for partial / fuzzy match
CREATE INDEX IF NOT EXISTS idx_contents_title_trgm ON contents USING GIN(title_bn gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contents_excerpt_trgm ON contents USING GIN(excerpt_bn gin_trgm_ops);

-- Trigger to keep search_vector up to date
CREATE OR REPLACE FUNCTION contents_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title_bn, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.title_en, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.excerpt_bn, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.excerpt_en, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.body_bn, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(NEW.body_en, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contents_search ON contents;
CREATE TRIGGER trg_contents_search
  BEFORE INSERT OR UPDATE ON contents
  FOR EACH ROW EXECUTE FUNCTION contents_search_vector_update();

-- ------------------------------------------------------------
-- RLS POLICIES
-- ------------------------------------------------------------
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Comments: public read approved, authenticated create
DROP POLICY IF EXISTS "Public can read approved comments" ON comments;
CREATE POLICY "Public can read approved comments"
  ON comments FOR SELECT USING (status = 'approved');
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON comments;
CREATE POLICY "Authenticated users can insert comments"
  ON comments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users can update own comments" ON comments;
CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE USING (auth.uid() = author_id);
DROP POLICY IF EXISTS "Moderators can update any comment" ON comments;
CREATE POLICY "Moderators can update any comment"
  ON comments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('moderator','admin')
    )
  );

-- Comment reactions
DROP POLICY IF EXISTS "Authenticated users can react" ON comment_reactions;
CREATE POLICY "Authenticated users can react"
  ON comment_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own reaction" ON comment_reactions;
CREATE POLICY "Users can delete own reaction"
  ON comment_reactions FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Public can read reactions" ON comment_reactions;
CREATE POLICY "Public can read reactions"
  ON comment_reactions FOR SELECT USING (true);

-- Bookmarks: private per user
DROP POLICY IF EXISTS "Users can read own bookmarks" ON bookmarks;
CREATE POLICY "Users can read own bookmarks"
  ON bookmarks FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own bookmarks" ON bookmarks;
CREATE POLICY "Users can insert own bookmarks"
  ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own bookmarks" ON bookmarks;
CREATE POLICY "Users can delete own bookmarks"
  ON bookmarks FOR DELETE USING (auth.uid() = user_id);

-- Newsletter subscribers
DROP POLICY IF EXISTS "Anyone can subscribe" ON newsletter_subscribers;
CREATE POLICY "Anyone can subscribe"
  ON newsletter_subscribers FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Subscribers can unsubscribe" ON newsletter_subscribers;
CREATE POLICY "Subscribers can unsubscribe"
  ON newsletter_subscribers FOR UPDATE USING (email = current_setting('request.jwt.claims', true)::json->>'email');
