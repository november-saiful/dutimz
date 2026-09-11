-- ============================================
-- PERFORMANCE INDEXES (section 3.3)
-- ============================================
CREATE INDEX idx_contents_status_published ON public.contents(status, published_at DESC);
CREATE INDEX idx_contents_category ON public.contents(category_id, published_at DESC);
CREATE INDEX idx_contents_featured ON public.contents(is_featured, published_at DESC) WHERE is_featured = true;
CREATE INDEX idx_contents_breaking ON public.contents(is_breaking, published_at DESC) WHERE is_breaking = true;
CREATE INDEX idx_contents_author ON public.contents(author_id, created_at DESC);
CREATE INDEX idx_contents_type ON public.contents(content_type, published_at DESC);
CREATE INDEX idx_contents_search ON public.contents USING gin(
    to_tsvector('simple',
      coalesce(title_bn, '') || ' ' || coalesce(title_en, '') || ' ' ||
      coalesce(body_bn, '') || ' ' || coalesce(body_en, '')
    )
);

CREATE INDEX idx_comments_content ON public.comments(content_id, created_at DESC);
CREATE INDEX idx_comments_parent ON public.comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_comments_author ON public.comments(author_id);

CREATE INDEX idx_bookmarks_user ON public.bookmarks(user_id, created_at DESC);
CREATE INDEX idx_reading_history_user ON public.reading_history(user_id, created_at DESC);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);
