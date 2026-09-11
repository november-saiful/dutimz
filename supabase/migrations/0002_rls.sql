-- ============================================
-- ROW LEVEL SECURITY (section 3.2)
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- ---------- helper ----------
CREATE OR REPLACE FUNCTION public.current_role_level()
RETURNS INT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (SELECT CASE p.role
        WHEN 'visitor' THEN 1
        WHEN 'reporter' THEN 2
        WHEN 'moderator' THEN 3
        WHEN 'admin' THEN 4
      END
     FROM public.profiles p WHERE p.id = auth.uid()),
    0
  );
$$;

-- ---------- PROFILES ----------
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins manage profiles"
  ON public.profiles FOR ALL
  USING (public.current_role_level() >= 4);

-- ---------- CATEGORIES / TAGS ----------
CREATE POLICY "Categories viewable by everyone"
  ON public.categories FOR SELECT USING (is_active = true OR public.current_role_level() >= 3);

CREATE POLICY "Moderators manage categories"
  ON public.categories FOR ALL
  USING (public.current_role_level() >= 3);

CREATE POLICY "Tags viewable by everyone"
  ON public.tags FOR SELECT USING (true);

CREATE POLICY "Moderators manage tags"
  ON public.tags FOR ALL
  USING (public.current_role_level() >= 3);

-- ---------- CONTENTS ----------
CREATE POLICY "Published content is viewable by everyone"
  ON public.contents FOR SELECT
  USING (status = 'published' AND published_at <= NOW());

CREATE POLICY "Authors can read own content"
  ON public.contents FOR SELECT
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can insert own drafts"
  ON public.contents FOR INSERT
  WITH CHECK (auth.uid() = author_id AND public.current_role_level() >= 2);

CREATE POLICY "Authors can update own content"
  ON public.contents FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own unpublished content"
  ON public.contents FOR DELETE
  USING (auth.uid() = author_id AND status IN ('draft', 'rejected'));

CREATE POLICY "Moderators manage all content"
  ON public.contents FOR ALL
  USING (public.current_role_level() >= 3);

-- ---------- CONTENT REVISIONS ----------
CREATE POLICY "Revisions viewable by editors"
  ON public.content_revisions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.contents c WHERE c.id = content_id AND (c.author_id = auth.uid() OR public.current_role_level() >= 3))
  );

CREATE POLICY "Reporters can insert revisions"
  ON public.content_revisions FOR INSERT
  WITH CHECK (auth.uid() = editor_id AND public.current_role_level() >= 2);

CREATE POLICY "Moderators manage revisions"
  ON public.content_revisions FOR ALL
  USING (public.current_role_level() >= 3);

-- ---------- COMMENTS ----------
CREATE POLICY "Approved comments are viewable by everyone"
  ON public.comments FOR SELECT USING (status = 'approved');

CREATE POLICY "Users can read own comments"
  ON public.comments FOR SELECT USING (auth.uid() = author_id);

CREATE POLICY "Authenticated users can comment"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = author_id);

CREATE POLICY "Users can edit own comments"
  ON public.comments FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "Moderators manage all comments"
  ON public.comments FOR ALL
  USING (public.current_role_level() >= 3);

-- ---------- COMMENT REACTIONS ----------
CREATE POLICY "Reactions viewable by everyone"
  ON public.comment_reactions FOR SELECT USING (true);

CREATE POLICY "Users manage own reactions"
  ON public.comment_reactions FOR ALL
  USING (auth.uid() = user_id);

-- ---------- BOOKMARKS ----------
CREATE POLICY "Bookmarks are private"
  ON public.bookmarks FOR ALL USING (auth.uid() = user_id);

-- ---------- READING HISTORY ----------
CREATE POLICY "Reading history is private"
  ON public.reading_history FOR ALL USING (auth.uid() = user_id);

-- ---------- NOTIFICATIONS ----------
CREATE POLICY "Notifications are private"
  ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- ---------- NEWSLETTER ----------
CREATE POLICY "Anyone can subscribe"
  ON public.newsletter_subscribers FOR INSERT WITH CHECK (true);

CREATE POLICY "Only admins read subscribers"
  ON public.newsletter_subscribers FOR SELECT
  USING (public.current_role_level() >= 4);

CREATE POLICY "Admins manage subscribers"
  ON public.newsletter_subscribers FOR ALL
  USING (public.current_role_level() >= 4);

-- ---------- POLLS ----------
CREATE POLICY "Active polls viewable by everyone"
  ON public.polls FOR SELECT USING (is_active = true OR public.current_role_level() >= 3);

CREATE POLICY "Moderators manage polls"
  ON public.polls FOR ALL USING (public.current_role_level() >= 3);

CREATE POLICY "Votes visible to voters and admins"
  ON public.poll_votes FOR SELECT
  USING (auth.uid() = user_id OR public.current_role_level() >= 4);

CREATE POLICY "Authenticated users can vote"
  ON public.poll_votes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- ---------- ADS ----------
CREATE POLICY "Active ads viewable by everyone"
  ON public.ads FOR SELECT USING (is_active = true OR public.current_role_level() >= 4);

CREATE POLICY "Admins manage ads"
  ON public.ads FOR ALL USING (public.current_role_level() >= 4);

-- ---------- SITE SETTINGS ----------
CREATE POLICY "Settings viewable by everyone"
  ON public.site_settings FOR SELECT USING (true);

CREATE POLICY "Admins update settings"
  ON public.site_settings FOR UPDATE
  USING (public.current_role_level() >= 4);
