-- ============================================
-- DUTIMZ NEWS PORTAL — Initial schema (Phase 1)
-- Users & Auth managed by Supabase Auth; extended via public.profiles.
-- ============================================

-- Role enum
CREATE TYPE USER_ROLE AS ENUM ('visitor', 'reporter', 'moderator', 'admin');

CREATE TYPE CONTENT_TYPE AS ENUM ('news', 'article', 'documentary');
CREATE TYPE CONTENT_STATUS AS ENUM ('draft', 'pending_review', 'published', 'archived', 'rejected');
CREATE TYPE CONTENT_FORMAT AS ENUM ('text', 'video', 'mixed');

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    email TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    role USER_ROLE NOT NULL DEFAULT 'visitor',
    bio TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CATEGORIES & TAGS
-- ============================================
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name_bn TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES public.categories(id),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name_bn TEXT NOT NULL,
    name_en TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONTENTS
-- ============================================
CREATE TABLE public.contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    content_type CONTENT_TYPE NOT NULL,
    content_format CONTENT_FORMAT NOT NULL DEFAULT 'text',
    language_primary TEXT NOT NULL DEFAULT 'bn',
    title_bn TEXT NOT NULL,
    subtitle_bn TEXT,
    excerpt_bn TEXT,
    body_bn TEXT,
    title_en TEXT,
    subtitle_en TEXT,
    excerpt_en TEXT,
    body_en TEXT,
    thumbnail_url TEXT,
    thumbnail_alt TEXT,
    featured_image_url TEXT,
    video_url TEXT,
    video_duration INTEGER,
    attachments JSONB DEFAULT '[]',
    category_id UUID REFERENCES public.categories(id),
    tags UUID[] DEFAULT '{}',
    author_id UUID REFERENCES public.profiles(id),
    status CONTENT_STATUS NOT NULL DEFAULT 'draft',
    published_at TIMESTAMPTZ,
    scheduled_at TIMESTAMPTZ,
    view_count INTEGER DEFAULT 0,
    read_time INTEGER,
    meta_title TEXT,
    meta_description TEXT,
    og_image_url TEXT,
    is_featured BOOLEAN DEFAULT FALSE,
    is_breaking BOOLEAN DEFAULT FALSE,
    is_commentable BOOLEAN DEFAULT TRUE,
    allow_notifications BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    parent_version_id UUID REFERENCES public.contents(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id),
    updated_by UUID REFERENCES public.profiles(id)
);

-- ============================================
-- CONTENT REVISIONS
-- ============================================
CREATE TABLE public.content_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
    editor_id UUID REFERENCES public.profiles(id),
    changes JSONB NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMMENTS (nested)
-- ============================================
CREATE TABLE public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.comments(id),
    author_id UUID REFERENCES public.profiles(id),
    author_name TEXT,
    author_email TEXT,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'approved',
    moderated_by UUID REFERENCES public.profiles(id),
    moderated_at TIMESTAMPTZ,
    likes INTEGER DEFAULT 0,
    dislikes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id),
    reaction_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id, reaction_type)
);

-- ============================================
-- BOOKMARKS & READING HISTORY
-- ============================================
CREATE TABLE public.bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
    folder TEXT DEFAULT 'default',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_id)
);

CREATE TABLE public.reading_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
    read_percentage INTEGER DEFAULT 0,
    time_spent INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_id)
);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- NEWSLETTER SUBSCRIBERS
-- ============================================
CREATE TABLE public.newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    preferences JSONB DEFAULT '{"categories": [], "frequency": "daily"}',
    is_active BOOLEAN DEFAULT TRUE,
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ
);

-- ============================================
-- POLLS
-- ============================================
CREATE TABLE public.polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id),
    option_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(poll_id, user_id)
);

-- ============================================
-- ADS
-- ============================================
CREATE TABLE public.ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    placement TEXT NOT NULL,
    image_url TEXT,
    link_url TEXT,
    html_content TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    impression_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SITE SETTINGS (single row)
-- ============================================
CREATE TABLE public.site_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    site_name TEXT DEFAULT 'DUTIMZ',
    site_tagline TEXT,
    logo_url TEXT,
    favicon_url TEXT,
    primary_color TEXT DEFAULT '#1a73e8',
    secondary_color TEXT DEFAULT '#34a853',
    accent_color TEXT DEFAULT '#fbbc04',
    social_links JSONB DEFAULT '{}',
    seo_defaults JSONB DEFAULT '{}',
    analytics_id TEXT,
    maintenance_mode BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
