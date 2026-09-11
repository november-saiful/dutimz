# DUTIMZ NEWS PORTAL — AI Agent Build Instructions

> **Project**: Dutimz News Portal  
> **Stack**: Cloudflare (Frontend + Edge API) + Supabase (Database + Auth + Storage) + GitHub (CI/CD + Version Control)  
> **Design**: Material 3 UI + Google Neural Expressive + Glass Morphism  
> **Typography**: SolaimanLipi (Bangla) | Times New Roman (English)  
> **Target**: Production-ready, scalable, Bangla-English bilingual news platform

---

## TABLE OF CONTENTS

1. [Executive Summary & Competitive Analysis](#1-executive-summary--competitive-analysis)
2. [Tech Stack Architecture](#2-tech-stack-architecture)
3. [Database Schema (Supabase PostgreSQL)](#3-database-schema-supabase-postgresql)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Content Management System](#5-content-management-system)
6. [Media Handling Strategy](#6-media-handling-strategy)
7. [Design System & UI/UX Specifications](#7-design-system--uiux-specifications)
8. [Frontend Architecture (Cloudflare Pages)](#8-frontend-architecture-cloudflare-pages)
9. [Backend API (Cloudflare Workers + Supabase Edge Functions)](#9-backend-api-cloudflare-workers--supabase-edge-functions)
10. [Feature Specifications by Module](#10-feature-specifications-by-module)
11. [SEO & Performance Requirements](#11-seo--performance-requirements)
12. [Deployment & CI/CD Pipeline (GitHub)](#12-deployment--cicd-pipeline-github)
13. [Security Requirements](#13-security-requirements)
14. [Testing Strategy](#14-testing-strategy)
15. [Development Phases & Milestones](#15-development-phases--milestones)

---

## 1. EXECUTIVE SUMMARY & COMPETITIVE ANALYSIS

### 1.1 What This Portal Is
Dutimz is a modern bilingual (Bangla/English) news portal supporting text news, video news, articles, and documentaries. It features a hierarchical role-based user system and emphasizes speed, accessibility, and reader engagement.

### 1.2 Competitive Feature Gap Analysis
After analyzing modern news portals (BBC, The Guardian, Prothom Alo, BDNews24, Al Jazeera, and 2026 UX trends), the following features are **commonly missing** from basic news sites and **must be included** in Dutimz:

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1 | **Text-to-Speech (TTS)** | HIGH | Listen to articles in Bangla + English. Essential for accessibility and mobile users. |
| 2 | **Smart Personalization Engine** | HIGH | AI-driven content feed based on reading history, bookmarks, and time-of-day patterns. |
| 3 | **Multi-Format Storytelling** | HIGH | Same story in text, video summary, audio, infographic, and key-insights card formats. |
| 4 | **WhatsApp Notification Integration** | MEDIUM | Breaking news alerts via WhatsApp Business API. Topic-based subscriptions. |
| 5 | **Windows/Web Push Notifications** | MEDIUM | Real-time breaking news push notifications via browser Push API. |
| 6 | **Auto Page Change / Infinite Scroll** | HIGH | Seamless reading experience without pagination clicks. |
| 7 | **Interlinking Suggestions** | HIGH | AI-powered "Related Stories" and "Read Next" suggestions at article end. |
| 8 | **Fast Loading / Mobile-First** | CRITICAL | Sub-2s LCP, mobile-first responsive design, lazy loading, CDN optimization. |
| 9 | **Advanced Comment System** | HIGH | Nested replies, reactions (like/love/angry), moderation queue, spam detection. |
| 10 | **Bookmark & Read-Later** | HIGH | User-specific reading lists with offline reading capability. |
| 11 | **Dark/Light/Auto Theme** | HIGH | System-aware theme switching with Material 3 dynamic color. |
| 12 | **Advanced Search** | HIGH | Full-text search with filters (date, category, author, content type), typo tolerance. |
| 13 | **Social Sharing with OG Cards** | HIGH | Dynamic Open Graph meta tags for rich social media previews. |
| 14 | **Newsletter Subscription** | MEDIUM | Email digest (daily/weekly) with category preferences. |
| 15 | **Live Blog / Real-time Updates** | MEDIUM | For breaking news — auto-updating timeline format. |
| 16 | **Polls & Surveys** | MEDIUM | Reader engagement polls embedded in articles. |
| 17 | **Author Profiles & Follow System** | MEDIUM | Follow favorite reporters, view author portfolios. |
| 18 | **Print-Friendly Mode** | LOW | Clean print stylesheet for articles. |
| 19 | **Reading Time Estimator** | MEDIUM | Display estimated reading time on all text content. |
| 20 | **Accessibility (WCAG 2.1 AA)** | CRITICAL | Screen reader support, keyboard navigation, ARIA labels, alt text. |
| 21 | **Analytics Dashboard (Admin)** | HIGH | Content performance, user engagement, traffic sources, real-time viewers. |
| 22 | **Content Scheduling** | HIGH | Reporters can schedule publish date/time. |
| 23 | **Revision History** | HIGH | Track content edits, rollback capability for moderators. |
| 24 | **Auto-Compression for Thumbnails** | CRITICAL | WebP/AVIF conversion, multiple sizes (thumb, medium, large, OG). |
| 25 | **RSS Feeds** | MEDIUM | Per-category and site-wide RSS/Atom feeds. |
| 26 | **AMP Support** | LOW | Accelerated Mobile Pages for news articles. |
| 27 | **AI Content Assistant** | MEDIUM | Auto headline suggestions, summary generation, tag recommendations for reporters. |
| 28 | **Ad Management System** | MEDIUM | Banner ad slots with impression tracking, proper ad-to-content ratio. |
| 29 | **Multi-Language Toggle** | HIGH | Seamless Bangla ↔ English switching with URL localization (`/bn/`, `/en/`). |
| 30 | **PWA (Progressive Web App)** | HIGH | Installable app, offline reading, background sync. |

---

## 2. TECH STACK ARCHITECTURE

### 2.1 Stack Overview

```
+-----------------------------------------------------------------------------+
|                              CLOUDFLARE LAYER                                |
|  +-----------------+  +-----------------+  +-----------------------------+  |
|  |  Cloudflare     |  |  Cloudflare     |  |  Cloudflare R2              |  |
|  |  Pages          |  |  Workers        |  |  (Backup File Storage)      |  |
|  |  (Frontend)     |  |  (Edge API)     |  |                             |  |
|  +--------+--------+  +--------+--------+  +-----------------------------+  |
|           |                    |                                              |
|           |  Static Assets     |  API Requests                                |
|           |  (HTML/CSS/JS)     |  (Auth, Content, Media)                      |
|           v                    v                                              |
+-----------------------------------------------------------------------------+
                                      |
                                      | HTTPS / REST / WebSocket
                                      v
+-----------------------------------------------------------------------------+
|                              SUPABASE LAYER                                  |
|  +-----------------+  +-----------------+  +-----------------------------+  |
|  |  PostgreSQL     |  |  Supabase Auth  |  |  Supabase Storage           |  |
|  |  (Database)     |  |  (User Mgmt)    |  |  (Thumbnails + Assets)      |  |
|  +-----------------+  +-----------------+  +-----------------------------+  |
|  +-----------------+  +-----------------+                                   |
|  |  Realtime       |  |  Edge Functions |                                   |
|  |  (Live Updates) |  |  (Serverless)   |                                   |
|  +-----------------+  +-----------------+                                   |
+-----------------------------------------------------------------------------+
                                      |
                                      | Git Push
                                      v
+-----------------------------------------------------------------------------+
|                              GITHUB LAYER                                    |
|  +-----------------+  +-----------------+  +-----------------------------+  |
|  |  Repository     |  |  GitHub Actions |  |  Issues / Projects          |  |
|  |  (Source Code)  |  |  (CI/CD)        |  |  (Task Management)          |  |
|  +-----------------+  +-----------------+  +-----------------------------+  |
+-----------------------------------------------------------------------------+
```

### 2.2 Technology Choices

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend Framework** | Next.js 14+ (App Router) | SSR/SSG, React Server Components, optimal SEO |
| **Frontend Deployment** | Cloudflare Pages | Global CDN, edge deployment, automatic HTTPS |
| **Styling** | Tailwind CSS + Material Tailwind | Utility-first + Material 3 components |
| **UI Components** | shadcn/ui + Custom Material 3 | Accessible, customizable component base |
| **State Management** | Zustand + React Query | Client state + Server state caching |
| **Edge API** | Cloudflare Workers | Low-latency API routes, image optimization, caching |
| **Backend/BaaS** | Supabase | PostgreSQL DB, Auth, Storage, Realtime, Edge Functions |
| **Database** | PostgreSQL 15+ (Supabase) | Relational data with JSONB for flexibility |
| **Auth** | Supabase Auth | JWT-based, OAuth, email/password, role-based access |
| **File Storage** | Supabase Storage + Cloudflare R2 | Thumbnails in Supabase (with transforms), backups in R2 |
| **Search** | Supabase Full-Text Search + pgvector | Native Postgres search, semantic search capability |
| **Real-time** | Supabase Realtime | Live comments, live blogs, notification badges |
| **Image Processing** | Cloudflare Images + Sharp (Worker) | Auto-compression, WebP/AVIF, responsive sizes |
| **CI/CD** | GitHub Actions | Automated testing, build, deploy to Cloudflare Pages |
| **Version Control** | Git + GitHub | Feature branches, PR reviews, semantic versioning |
| **Monitoring** | Cloudflare Analytics + Supabase Logs | Performance, errors, usage tracking |
| **TTS** | Web Speech API (client) + gTTS API (server fallback) | Bangla + English text-to-speech |

---

## 3. DATABASE SCHEMA (SUPABASE POSTGRESQL)

### 3.1 Core Tables

```sql
-- ============================================
-- USERS & AUTH (Managed by Supabase Auth)
-- ============================================
-- Supabase handles auth.users internally.
-- We extend with a public profiles table.

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

-- Role enum
CREATE TYPE USER_ROLE AS ENUM ('visitor', 'reporter', 'moderator', 'admin');

-- ============================================
-- CATEGORIES
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

-- ============================================
-- TAGS
-- ============================================
CREATE TABLE public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name_bn TEXT NOT NULL,
    name_en TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONTENT (News, Articles, Documentaries)
-- ============================================
CREATE TYPE CONTENT_TYPE AS ENUM ('news', 'article', 'documentary');
CREATE TYPE CONTENT_STATUS AS ENUM ('draft', 'pending_review', 'published', 'archived', 'rejected');
CREATE TYPE CONTENT_FORMAT AS ENUM ('text', 'video', 'mixed');

CREATE TABLE public.contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    slug TEXT UNIQUE NOT NULL,
    content_type CONTENT_TYPE NOT NULL,
    content_format CONTENT_FORMAT NOT NULL DEFAULT 'text',

    -- Language versions (both stored, one is primary)
    language_primary TEXT NOT NULL DEFAULT 'bn', -- 'bn' or 'en'

    -- Bangla Content
    title_bn TEXT NOT NULL,
    subtitle_bn TEXT,
    excerpt_bn TEXT,
    body_bn TEXT,

    -- English Content
    title_en TEXT,
    subtitle_en TEXT,
    excerpt_en TEXT,
    body_en TEXT,

    -- Media
    thumbnail_url TEXT,
    thumbnail_alt TEXT,
    featured_image_url TEXT,
    video_url TEXT, -- External link (YouTube, Vimeo, etc.)
    video_duration INTEGER, -- in seconds

    -- Attachments (links only, no direct uploads)
    attachments JSONB DEFAULT '[]', -- [{type: 'pdf', url: '...', title: '...'}, ...]

    -- Metadata
    category_id UUID REFERENCES public.categories(id),
    tags UUID[] DEFAULT '{}',
    author_id UUID REFERENCES public.profiles(id),

    -- Status & Publishing
    status CONTENT_STATUS NOT NULL DEFAULT 'draft',
    published_at TIMESTAMPTZ,
    scheduled_at TIMESTAMPTZ,

    -- Engagement
    view_count INTEGER DEFAULT 0,
    read_time INTEGER, -- estimated minutes

    -- SEO
    meta_title TEXT,
    meta_description TEXT,
    og_image_url TEXT,

    -- Flags
    is_featured BOOLEAN DEFAULT FALSE,
    is_breaking BOOLEAN DEFAULT FALSE,
    is_commentable BOOLEAN DEFAULT TRUE,
    allow_notifications BOOLEAN DEFAULT TRUE,

    -- Versioning
    version INTEGER DEFAULT 1,
    parent_version_id UUID REFERENCES public.contents(id),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id),
    updated_by UUID REFERENCES public.profiles(id)
);

-- ============================================
-- CONTENT REVISIONS (Audit Trail)
-- ============================================
CREATE TABLE public.content_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
    editor_id UUID REFERENCES public.profiles(id),
    changes JSONB NOT NULL, -- diff of changes
    version INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMMENTS (Nested)
-- ============================================
CREATE TABLE public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.comments(id), -- for nested replies
    author_id UUID REFERENCES public.profiles(id),
    author_name TEXT, -- for anonymous/guest comments (if enabled later)
    author_email TEXT,
    body TEXT NOT NULL,

    -- Moderation
    status TEXT DEFAULT 'approved', -- approved, pending, rejected, spam
    moderated_by UUID REFERENCES public.profiles(id),
    moderated_at TIMESTAMPTZ,

    -- Engagement
    likes INTEGER DEFAULT 0,
    dislikes INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMMENT REACTIONS
-- ============================================
CREATE TABLE public.comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id),
    reaction_type TEXT NOT NULL, -- like, love, angry, sad, laugh
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id, reaction_type)
);

-- ============================================
-- BOOKMARKS / READ-LATER
-- ============================================
CREATE TABLE public.bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
    folder TEXT DEFAULT 'default',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_id)
);

-- ============================================
-- USER READING HISTORY (For Personalization)
-- ============================================
CREATE TABLE public.reading_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
    read_percentage INTEGER DEFAULT 0,
    time_spent INTEGER DEFAULT 0, -- seconds
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_id)
);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- comment_reply, content_published, breaking_news, etc.
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
-- POLLS / SURVEYS
-- ============================================
CREATE TABLE public.polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- [{id: '1', text: 'Option 1', votes: 0}, ...]
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
-- ADS / SPONSORED CONTENT
-- ============================================
CREATE TABLE public.ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    placement TEXT NOT NULL, -- header, sidebar, inline, footer
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
-- SITE SETTINGS (Admin Config)
-- ============================================
CREATE TABLE public.site_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    site_name TEXT DEFAULT 'Dutimz',
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
```

### 3.2 Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all profiles, update only own
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Contents: Published content viewable by all
-- Drafts only by author, admins, moderators
CREATE POLICY "Published content is viewable by everyone" ON public.contents
    FOR SELECT USING (status = 'published' AND published_at <= NOW());

CREATE POLICY "Authors can manage own drafts" ON public.contents
    FOR ALL USING (auth.uid() = author_id);

CREATE POLICY "Admins and moderators can manage all content" ON public.contents
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'moderator')
        )
    );

-- Comments: Viewable by all, insert by authenticated users
CREATE POLICY "Comments are viewable by everyone" ON public.comments
    FOR SELECT USING (status = 'approved');

CREATE POLICY "Authenticated users can comment" ON public.comments
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can edit own comments" ON public.comments
    FOR UPDATE USING (auth.uid() = author_id);

-- Bookmarks: Private to user
CREATE POLICY "Bookmarks are private" ON public.bookmarks
    FOR ALL USING (auth.uid() = user_id);

-- Notifications: Private to user
CREATE POLICY "Notifications are private" ON public.notifications
    FOR ALL USING (auth.uid() = user_id);
```

### 3.3 Indexes for Performance

```sql
-- Content indexes
CREATE INDEX idx_contents_status_published ON public.contents(status, published_at DESC);
CREATE INDEX idx_contents_category ON public.contents(category_id, published_at DESC);
CREATE INDEX idx_contents_featured ON public.contents(is_featured, published_at DESC) WHERE is_featured = true;
CREATE INDEX idx_contents_breaking ON public.contents(is_breaking, published_at DESC) WHERE is_breaking = true;
CREATE INDEX idx_contents_author ON public.contents(author_id, created_at DESC);
CREATE INDEX idx_contents_type ON public.contents(content_type, published_at DESC);
CREATE INDEX idx_contents_search ON public.contents USING gin(
    to_tsvector('simple', coalesce(title_bn, '') || ' ' || coalesce(title_en, '') || ' ' || coalesce(body_bn, '') || ' ' || coalesce(body_en, ''))
);

-- Comment indexes
CREATE INDEX idx_comments_content ON public.comments(content_id, created_at DESC);
CREATE INDEX idx_comments_parent ON public.comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_comments_author ON public.comments(author_id);

-- Other indexes
CREATE INDEX idx_bookmarks_user ON public.bookmarks(user_id, created_at DESC);
CREATE INDEX idx_reading_history_user ON public.reading_history(user_id, created_at DESC);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);
```

---

## 4. AUTHENTICATION & AUTHORIZATION

### 4.1 Role Hierarchy

```
Admin (Level 4)
|-- Can do everything
|-- User management (promote/demote/ban)
|-- Site settings
|-- Analytics dashboard
+-- All Moderator permissions

Moderator (Level 3)
|-- Delete any content
|-- Edit any content
|-- Moderate comments (approve/reject/spam)
|-- Manage categories and tags
+-- All Reporter permissions

Reporter (Level 2)
|-- Create content (news, articles, documentaries)
|-- Edit own content
|-- Delete own content (if not published)
|-- Upload thumbnails
|-- Schedule content
+-- All Visitor permissions

Visitor (Level 1) - DEFAULT
|-- Comment on content (where enabled)
|-- Reply to comments
|-- React to comments
|-- Bookmark content
|-- Manage profile
|-- Subscribe to newsletter
|-- Vote in polls
+-- Follow authors
```

### 4.2 Supabase Auth Configuration

- **Email/Password**: Enabled with email verification
- **Magic Link**: Enabled for passwordless login
- **OAuth Providers**: Google, Facebook (optional: Apple, Twitter/X)
- **Phone OTP**: Enabled for Bangladesh (+880) numbers
- **JWT Expiry**: 1 hour access token, 7 days refresh token
- **Password Policy**: Min 8 chars, 1 uppercase, 1 lowercase, 1 number

### 4.3 Role Assignment Flow

```
1. User signs up -> Default role: 'visitor'
2. Admin promotes user to 'reporter' via Admin Dashboard
3. Admin promotes reporter to 'moderator' via Admin Dashboard
4. Only existing admins can create new admins
```

### 4.4 Middleware/Guard Logic (Cloudflare Worker)

```typescript
// Role-based access control middleware
interface AuthContext {
  user: User;
  profile: Profile;
  role: UserRole;
}

const ROLE_HIERARCHY = {
  visitor: 1,
  reporter: 2,
  moderator: 3,
  admin: 4
};

function requireRole(minRole: UserRole) {
  return async (request: Request, env: Env) => {
    const auth = await authenticate(request, env);
    if (!auth) return new Response('Unauthorized', { status: 401 });

    if (ROLE_HIERARCHY[auth.role] < ROLE_HIERARCHY[minRole]) {
      return new Response('Forbidden', { status: 403 });
    }

    return auth;
  };
}

// Usage:
// POST /api/contents -> requireRole('reporter')
// DELETE /api/contents/:id -> requireRole('moderator')
// PATCH /api/users/:id/role -> requireRole('admin')
```

---

## 5. CONTENT MANAGEMENT SYSTEM

### 5.1 Content Types

| Type | Description | Format | Examples |
|------|-------------|--------|----------|
| **News** | Time-sensitive reporting | text / video / mixed | Breaking news, daily news, political news |
| **Article** | In-depth non-news writing | text | Opinion pieces, features, analysis, explainers |
| **Documentary** | Non-news video content | video | Investigative videos, cultural documentaries |

### 5.2 Content Workflow

```
[Reporter Creates] -> [Draft]
       |
       v
[Reporter Saves] -> [Draft] (auto-save every 30s)
       |
       v
[Reporter Submits for Review] -> [Pending Review]
       |
       v
[Moderator/Admin Reviews] ---> [Rejected] -> Back to Draft
       |
       v
[Approved & Scheduled/Published] -> [Published]
       |
       v
[Moderator/Admin Archives] -> [Archived]
```

### 5.3 Content Fields by Type

**All Content Types:**
- Title (BN + EN)
- Subtitle (BN + EN)
- Excerpt/Summary (BN + EN)
- Body/Description (BN + EN)
- Category
- Tags
- Thumbnail (uploadable, auto-compressed)
- Featured Image (optional)
- Attachments (links: PDF, audio, external video)
- SEO Meta Title & Description
- OG Image
- Comment toggle
- Notification toggle
- Scheduled publish time

**News Only:**
- Breaking news flag
- News format (text-only / video-only / mixed)
- Video URL (external embed)
- Video duration
- Location (optional)

**Article Only:**
- Reading time (auto-calculated)
- Author byline
- Series/Part number (optional)

**Documentary Only:**
- Video URL (external embed)
- Video duration
- Director/Producer credits
- Transcript text (optional)

### 5.4 Content Editor Requirements

- **Rich Text Editor**: TipTap or Lexical with:
  - Bangla and English typing support
  - Heading (H2, H3), paragraph, bold, italic, underline
  - Blockquotes, lists (ordered/unordered)
  - Image embed via URL (not upload)
  - Video embed via URL (YouTube, Vimeo, Facebook)
  - Link insertion
  - Table support
  - Text alignment
  - Undo/Redo
  - Word count
  - Auto-save draft every 30 seconds
  - Markdown paste support
  - Keyboard shortcuts (Ctrl+B, Ctrl+I, etc.)

---

## 6. MEDIA HANDLING STRATEGY

### 6.1 Thumbnail Upload & Processing Pipeline

```
[User Uploads Image] 
    |
    v
[Cloudflare Worker Receives File]
    |
    |-- Validate: JPG, PNG, WebP, AVIF only
    |-- Max file size: 5MB
    |-- Max dimensions: 4000x4000
    |
    v
[Sharp/ImageMagick Processing in Worker]
    |
    |-- Generate sizes:
    |   |-- thumb: 300x200 (crop center)
    |   |-- medium: 800x600 (fit)
    |   |-- large: 1600x900 (fit)
    |   +-- og: 1200x630 (fit, for social sharing)
    |-- Convert to WebP (primary) + AVIF (future-proof)
    |-- Quality: 80% WebP, 60% AVIF
    |-- Strip metadata (privacy)
    |
    v
[Upload to Supabase Storage]
    |
    |-- Path: thumbnails/{content_id}/{size}.webp
    |-- Public URL generated
    |
    v
[Store URL in contents.thumbnail_url]
```

### 6.2 Attachment Links (No Direct Upload)

For PDFs, audio files, large videos, or any other attachments:
- Reporter provides external URL only
- System validates URL format
- Displays as styled link/embed in content
- Supported types: PDF, MP3, MP4 (external), YouTube, Vimeo, SoundCloud

### 6.3 Video Handling

- **Video News / Documentaries**: External embed only (YouTube, Vimeo, Facebook Video)
- Store video URL in `contents.video_url`
- Auto-extract thumbnail from video platform API (if available)
- Display responsive embed iframe with lazy loading
- Custom video player UI overlay for branding

### 6.4 Image CDN Strategy

- Use **Cloudflare Images** for on-the-fly resizing
- Variants: `thumb`, `medium`, `large`, `og`
- Fallback chain: AVIF -> WebP -> JPEG
- Lazy loading with blur-up placeholder

---

## 7. DESIGN SYSTEM & UI/UX SPECIFICATIONS

### 7.1 Design Philosophy

**Material 3 (Material You)** + **Neural Expressive** + **Glass Morphism**

- **Material 3**: Dynamic color, elevation, motion, component structure
- **Neural Expressive**: Organic shapes, fluid animations, emotional color responses
- **Glass Morphism**: Translucent surfaces, backdrop blur, subtle borders, depth layering

### 7.2 Color Palette (Dynamic)

```css
/* Primary colors - derived from site branding */
--md-sys-color-primary: #1a73e8;
--md-sys-color-on-primary: #ffffff;
--md-sys-color-primary-container: #d3e3fd;
--md-sys-color-on-primary-container: #041e49;

/* Secondary */
--md-sys-color-secondary: #34a853;
--md-sys-color-on-secondary: #ffffff;

/* Tertiary / Accent */
--md-sys-color-tertiary: #fbbc04;
--md-sys-color-on-tertiary: #000000;

/* Surface - Glass Morphism Base */
--md-sys-color-surface: rgba(255, 255, 255, 0.72);
--md-sys-color-surface-variant: rgba(255, 255, 255, 0.56);
--md-sys-color-on-surface: #1f1f1f;
--md-sys-color-on-surface-variant: #444746;

/* Glass Effect */
--glass-bg: rgba(255, 255, 255, 0.65);
--glass-bg-dark: rgba(30, 30, 30, 0.65);
--glass-border: rgba(255, 255, 255, 0.3);
--glass-border-dark: rgba(255, 255, 255, 0.1);
--glass-blur: blur(20px) saturate(180%);

/* Dark Mode Surfaces */
--md-sys-color-surface-dark: rgba(30, 30, 30, 0.8);
--md-sys-color-surface-variant-dark: rgba(60, 60, 60, 0.6);
--md-sys-color-on-surface-dark: #e3e3e3;

/* Breaking News Alert */
--color-breaking: #ea4335;
--color-breaking-container: #fce8e6;

/* Success / Warning / Error */
--color-success: #34a853;
--color-warning: #fbbc04;
--color-error: #ea4335;
```

### 7.3 Typography

```css
/* === BANGLA: SolaimanLipi === */
@font-face {
  font-family: 'SolaimanLipi';
  src: url('/fonts/SolaimanLipi.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: 'SolaimanLipi';
  src: url('/fonts/SolaimanLipi-Bold.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}

/* === ENGLISH: Times New Roman === */
@font-face {
  font-family: 'Times New Roman';
  src: local('Times New Roman'), local('TimesNewRoman');
}

/* === TYPOGRAPHY SCALE === */
/* Headlines */
--font-headline-large: 700 2.5rem/1.2 'SolaimanLipi', 'Times New Roman', serif;
--font-headline-medium: 700 2rem/1.25 'SolaimanLipi', 'Times New Roman', serif;
--font-headline-small: 700 1.5rem/1.3 'SolaimanLipi', 'Times New Roman', serif;

/* Body */
--font-body-large: 400 1.125rem/1.7 'SolaimanLipi', 'Times New Roman', serif;
--font-body-medium: 400 1rem/1.7 'SolaimanLipi', 'Times New Roman', serif;
--font-body-small: 400 0.875rem/1.6 'SolaimanLipi', 'Times New Roman', serif;

/* Labels / UI */
--font-label-large: 500 0.875rem/1.5 'SolaimanLipi', 'Times New Roman', serif;
--font-label-medium: 500 0.75rem/1.5 'SolaimanLipi', 'Times New Roman', serif;

/* Special: Breaking News Ticker */
--font-ticker: 700 1rem/1.4 'SolaimanLipi', 'Times New Roman', serif;
```

### 7.4 Glass Morphism Component Specs

```css
/* Card Component */
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 2px 4px -1px rgba(0, 0, 0, 0.03),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

/* Navigation Bar */
.glass-nav {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

/* Dark Mode Glass */
.glass-card-dark {
  background: var(--glass-bg-dark);
  border: 1px solid var(--glass-border-dark);
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
```

### 7.5 Neural Expressive Animations

```css
/* Smooth page transitions */
.page-transition {
  animation: fadeSlideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Card hover - Neural fluid response */
.card-hover {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.card-hover:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow: 
    0 20px 25px -5px rgba(0, 0, 0, 0.08),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

/* Skeleton loading - Shimmer effect */
.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.4) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

/* Staggered list animation */
.stagger-item {
  animation: fadeSlideUp 0.3s ease-out backwards;
}
.stagger-item:nth-child(1) { animation-delay: 0ms; }
.stagger-item:nth-child(2) { animation-delay: 50ms; }
.stagger-item:nth-child(3) { animation-delay: 100ms; }
```

### 7.6 Layout Specifications

```
Breakpoints:
- Mobile: 0 - 639px
- Tablet: 640px - 1023px
- Desktop: 1024px - 1279px
- Wide: 1280px+

Container Max Width: 1280px
Content Max Width (Reading): 720px
Grid: 12-column with 24px gap

Spacing Scale (Material 3):
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px
- 3xl: 64px
```

### 7.7 Key UI Components to Build

1. **GlassNavigation** -- Sticky top nav with blur, logo, categories, search, user menu
2. **BreakingNewsTicker** -- Animated horizontal ticker for breaking news
3. **GlassCard** -- Content preview cards with image, title, meta, glass effect
4. **HeroSection** -- Featured content carousel with glass overlay
5. **ContentGrid** -- Responsive masonry/grid for content listing
6. **GlassSidebar** -- Category list, popular tags, recent posts
7. **CommentThread** -- Nested comments with reactions
8. **ShareButtons** -- Social sharing with copy link
9. **TTSPlayer** -- Floating audio player for text-to-speech
10. **ThemeToggle** -- Sun/moon icon with smooth transition
11. **LanguageSwitcher** -- BN/EN toggle with flag indicators
12. **BookmarkButton** -- Heart icon with animation
13. **PollWidget** -- Interactive voting component
14. **NewsletterForm** -- Email subscription with validation
15. **SearchModal** -- Full-screen search with filters
16. **AdminSidebar** -- Dashboard navigation for admin/moderator/reporter
17. **ContentEditor** -- Rich text editor panel
18. **MediaUploader** -- Thumbnail upload with preview and crop
19. **AnalyticsCards** -- Stat cards for admin dashboard
20. **NotificationBell** -- Real-time notification dropdown

---

## 8. FRONTEND ARCHITECTURE (CLOUDFLARE PAGES)

### 8.1 Project Structure

```
dutimz-news-portal/
|-- .github/
|   +-- workflows/
|       |-- ci.yml              # Lint, test, build check
|       +-- deploy.yml          # Deploy to Cloudflare Pages
|-- src/
|   |-- app/                    # Next.js 14 App Router
|   |   |-- (public)/           # Public-facing routes
|   |   |   |-- page.tsx        # Homepage
|   |   |   |-- [category]/     # Category pages
|   |   |   |-- news/
|   |   |   |   +-- [slug]/     # News detail page
|   |   |   |-- articles/
|   |   |   |   +-- [slug]/     # Article detail page
|   |   |   |-- documentaries/
|   |   |   |   +-- [slug]/     # Documentary detail page
|   |   |   |-- search/         # Search results
|   |   |   |-- bookmark/       # User bookmarks
|   |   |   |-- profile/        # User profile
|   |   |   +-- layout.tsx      # Public layout (nav, footer)
|   |   |-- (dashboard)/        # Admin/Reporter/Moderator panel
|   |   |   |-- admin/          # Admin routes
|   |   |   |-- moderator/      # Moderator routes
|   |   |   |-- reporter/       # Reporter routes
|   |   |   +-- layout.tsx      # Dashboard layout (sidebar)
|   |   |-- api/                # API routes (if needed)
|   |   |-- layout.tsx          # Root layout
|   |   +-- globals.css         # Global styles
|   |-- components/
|   |   |-- ui/                 # shadcn/ui components
|   |   |-- glass/              # Glass morphism components
|   |   |-- content/            # Content-specific components
|   |   |-- comments/           # Comment system components
|   |   |-- navigation/         # Nav components
|   |   +-- forms/              # Form components
|   |-- hooks/                  # Custom React hooks
|   |-- lib/
|   |   |-- supabase/           # Supabase client config
|   |   |-- cloudflare/         # Cloudflare Workers client
|   |   |-- utils/              # Utility functions
|   |   +-- constants/          # App constants
|   |-- types/                  # TypeScript types
|   |-- stores/                 # Zustand stores
|   +-- styles/
|       |-- fonts/              # SolaimanLipi font files
|       +-- themes/             # Theme configurations
|-- public/
|   |-- fonts/
|   |-- images/
|   +-- manifest.json           # PWA manifest
|-- supabase/
|   |-- migrations/             # Database migrations
|   |-- functions/              # Supabase Edge Functions
|   +-- seed.sql                # Seed data
|-- workers/                    # Cloudflare Workers
|   |-- src/
|   |   |-- index.ts            # Main worker
|   |   |-- handlers/           # Route handlers
|   |   |-- middleware/         # Auth, CORS, rate limiting
|   |   +-- services/           # Business logic
|   +-- wrangler.toml
|-- tests/
|   |-- unit/
|   |-- integration/
|   +-- e2e/
|-- next.config.js
|-- tailwind.config.ts
|-- tsconfig.json
|-- package.json
+-- README.md
```

### 8.2 Route Structure

```
PUBLIC ROUTES:
/                           -> Homepage (hero + latest + categories)
/bn/* /en/*                 -> Language-prefixed routes
/category/[slug]            -> Category listing
/news/[slug]                -> News detail
/articles/[slug]            -> Article detail
/documentaries/[slug]       -> Documentary detail
/search?q=...               -> Search results
/bookmarks                  -> User bookmarks (auth required)
/profile                    -> User profile (auth required)
/notifications              -> User notifications (auth required)
/auth/login                 -> Login page
/auth/register              -> Registration page
/auth/reset-password        -> Password reset
/rss.xml                    -> RSS feed
/sitemap.xml                -> SEO sitemap

DASHBOARD ROUTES (Protected):
/reporter/dashboard         -> Reporter home
/reporter/contents/new      -> Create content
/reporter/contents          -> My contents
/reporter/contents/[id]/edit -> Edit content

/moderator/dashboard        -> Moderator home
/moderator/contents         -> All contents (manage)
/moderator/comments         -> Comment moderation queue
/moderator/categories       -> Category management

/admin/dashboard            -> Admin home
/admin/users                -> User management
/admin/settings             -> Site settings
/admin/analytics            -> Analytics dashboard
/admin/ads                  -> Ad management
/admin/newsletter           -> Newsletter management
```

### 8.3 State Management

```typescript
// Zustand Stores

// Auth Store
interface AuthStore {
  user: User | null;
  profile: Profile | null;
  role: UserRole;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// Theme Store
interface ThemeStore {
  mode: 'light' | 'dark' | 'system';
  setMode: (mode: 'light' | 'dark' | 'system') => void;
}

// UI Store
interface UIStore {
  isSearchOpen: boolean;
  isMobileMenuOpen: boolean;
  toastQueue: Toast[];
  openSearch: () => void;
  closeSearch: () => void;
  addToast: (toast: Toast) => void;
}

// Content Store (React Query preferred for server state)
```

---

## 9. BACKEND API (CLOUDFLARE WORKERS + SUPABASE EDGE FUNCTIONS)

### 9.1 API Architecture

```
Client (Next.js)
    |
    |-- Static data (ISR/SSG) -> Cloudflare Pages CDN
    |
    |-- Dynamic reads -> Cloudflare Worker (cached) -> Supabase REST API
    |
    |-- Mutations (POST/PUT/DELETE) -> Cloudflare Worker -> Supabase
    |
    |-- Real-time -> Supabase Realtime (WebSocket)
    |
    +-- File uploads -> Cloudflare Worker -> Process -> Supabase Storage
```

### 9.2 Cloudflare Worker Endpoints

```typescript
// WORKER ROUTES (src/workers/src/index.ts)

// === PUBLIC ROUTES ===
GET    /api/contents              -> List contents (with filters)
GET    /api/contents/:id          -> Get single content
GET    /api/contents/:id/related  -> Get related contents
GET    /api/categories            -> List categories
GET    /api/categories/:slug      -> Get category with contents
GET    /api/tags/:slug            -> Get tag with contents
GET    /api/comments/:contentId   -> Get comments for content
GET    /api/search?q=...          -> Full-text search
GET    /api/featured              -> Get featured contents
GET    /api/breaking              -> Get breaking news
GET    /api/rss.xml               -> Generate RSS feed
GET    /api/sitemap.xml           -> Generate sitemap

// === AUTH ROUTES ===
POST   /api/auth/register         -> Register new user
POST   /api/auth/login            -> Login
POST   /api/auth/logout           -> Logout
POST   /api/auth/refresh          -> Refresh token
POST   /api/auth/forgot-password  -> Send reset email
POST   /api/auth/reset-password   -> Reset password

// === PROTECTED: VISITOR+ ===
POST   /api/comments              -> Create comment (auth required)
PUT    /api/comments/:id          -> Edit own comment
DELETE /api/comments/:id          -> Delete own comment
POST   /api/comments/:id/react    -> React to comment
POST   /api/bookmarks             -> Add bookmark
DELETE /api/bookmarks/:id         -> Remove bookmark
GET    /api/bookmarks             -> List bookmarks
POST   /api/polls/:id/vote        -> Vote in poll
POST   /api/notifications/read    -> Mark notifications read

// === PROTECTED: REPORTER+ ===
POST   /api/contents              -> Create content
PUT    /api/contents/:id          -> Update own content
DELETE /api/contents/:id          -> Delete own content (if draft)
POST   /api/upload/thumbnail      -> Upload thumbnail

// === PROTECTED: MODERATOR+ ===
PUT    /api/contents/:id          -> Update ANY content
DELETE /api/contents/:id          -> Delete ANY content
PUT    /api/comments/:id/moderate -> Approve/reject comment
PUT    /api/categories/:id        -> Update category
POST   /api/categories            -> Create category
PUT    /api/tags/:id              -> Update tag

// === PROTECTED: ADMIN ONLY ===
GET    /api/admin/analytics       -> Dashboard analytics
GET    /api/admin/users           -> List all users
PUT    /api/admin/users/:id/role  -> Change user role
DELETE /api/admin/users/:id       -> Ban/delete user
PUT    /api/admin/settings        -> Update site settings
POST   /api/admin/ads             -> Create ad
PUT    /api/admin/ads/:id         -> Update ad
DELETE /api/admin/ads/:id         -> Delete ad
POST   /api/admin/newsletter/send -> Send newsletter
```

### 9.3 Supabase Edge Functions

```typescript
// supabase/functions/

// 1. send-notification.ts
// Triggered by database webhooks
// Sends push notifications, WhatsApp messages, emails

// 2. process-thumbnail.ts
// Triggered by storage upload
// Additional image processing, metadata extraction

// 3. generate-summary.ts
// AI-powered content summarization
// Generates excerpt if not provided

// 4. content-scheduler.ts
// Cron job (every minute)
// Publishes scheduled content

// 5. newsletter-digest.ts
// Cron job (daily/weekly)
// Generates and sends newsletter emails

// 6. analytics-aggregator.ts
// Cron job (hourly)
// Aggregates view counts, engagement metrics
```

### 9.4 Rate Limiting (Cloudflare Worker)

```typescript
// Rate limits per IP
const RATE_LIMITS = {
  public: { requests: 100, window: 60 },      // 100 req/min
  auth: { requests: 10, window: 60 },          // 10 login attempts/min
  comment: { requests: 30, window: 60 },       // 30 comments/min
  upload: { requests: 5, window: 60 },         // 5 uploads/min
  search: { requests: 60, window: 60 },        // 60 searches/min
};
```

---

## 10. FEATURE SPECIFICATIONS BY MODULE

### 10.1 Homepage

**Sections (in order):**
1. **Breaking News Ticker** -- Horizontal scrolling ticker, red accent, glass background
2. **Hero Section** -- 3-5 featured content carousel with large images, glass overlay text
3. **Latest News Grid** -- 6-card grid of most recent news
4. **Category Sections** -- 3-4 category blocks (Politics, Sports, Tech, etc.) with 4 items each
5. **Popular/ Trending** -- Most viewed content this week
6. **Documentary Spotlight** -- Featured documentary with video thumbnail
7. **Newsletter CTA** -- Glass card with email subscription form
8. **Footer** -- Site links, categories, social links, copyright

### 10.2 Content Detail Page

**Layout:**
- Breadcrumb navigation
- Category badge + publish date + reading time
- Title (large headline typography)
- Subtitle (optional)
- Author info with avatar + follow button
- Share buttons (Facebook, Twitter, WhatsApp, Copy Link)
- Bookmark button
- TTS play button
- Featured image / Video embed
- Article body (rich text)
- Attachments list (if any)
- Tags
- "Related Stories" section (6 items)
- "Read Next" suggestion
- Poll (if embedded)
- Comments section

### 10.3 Comment System

- Nested replies (max 3 levels deep)
- Sort by: Newest, Oldest, Most Liked
- Real-time new comment indicator
- Moderation queue for new users (first 3 comments require approval)
- Auto spam detection (keyword filter + rate limiting)
- Reporter/Moderator/Admin badge on comments
- @mentions support
- Rich text: bold, italic, links, emoji

### 10.4 Search System

- Full-screen modal (Cmd+K / Ctrl+K shortcut)
- Instant search with debounce (300ms)
- Filters: Content type, Category, Date range, Author
- Search history (localStorage)
- Popular searches suggestion
- Results grouped by type
- Highlight matching terms

### 10.5 Text-to-Speech (TTS)

- Floating player bar at bottom
- Language auto-detection (BN/EN)
- Play/Pause/Stop controls
- Speed control (0.5x - 2x)
- Voice selection (male/female where available)
- Highlight current sentence in article
- Minimize to floating button

**Implementation:**
- Primary: Web Speech API (`speechSynthesis`)
- Fallback: Server-side TTS API (gTTS or similar) for Bangla support
- Pre-generate audio for popular articles (cache in R2)

### 10.6 Personalization Engine

- Track: Reading history, time spent, categories read, authors followed
- Personalized "For You" section on homepage
- "Continue Reading" -- unfinished articles
- "Recommended" -- based on similar users (collaborative filtering)
- "Trending in [Category]" -- based on user's top categories
- Store preferences in `profiles.preferences` JSONB

### 10.7 Admin Dashboard

**Widgets:**
- Stats cards: Total contents, Users today, Comments today, Page views
- Traffic chart (7/30/90 days)
- Content status pie chart (draft/pending/published)
- Recent comments (pending approval)
- Top performing content
- User growth chart

**Management Tables:**
- Contents: Sortable, filterable, bulk actions
- Users: Search, filter by role, ban/unban
- Comments: Moderation queue with approve/reject/spam
- Categories: CRUD with drag-drop reordering
- Ads: CRUD with impression/click stats
- Newsletter: Subscriber list, compose, send

### 10.8 PWA Features

- Web App Manifest with icons
- Service Worker for offline caching
- Background sync for bookmarks/comments
- Add to Home Screen prompt
- Offline reading list (cache bookmarked articles)
- Push notification subscription

---

## 11. SEO & PERFORMANCE REQUIREMENTS

### 11.1 SEO Checklist

- [ ] Server-side rendering (SSR) for all content pages
- [ ] Dynamic meta tags (title, description, OG, Twitter Card)
- [ ] Structured data (JSON-LD): Article, NewsArticle, Organization
- [ ] Canonical URLs
- [ ] XML sitemap (auto-generated, submitted to search engines)
- [ ] RSS/Atom feeds per category
- [ ] Semantic HTML (article, section, nav, header, footer)
- [ ] Descriptive URLs with slugs
- [ ] Alt text for all images
- [ ] Internal linking strategy
- [ ] BreadcrumbList schema
- [ ] AMP version for news articles (optional)
- [ ] robots.txt configuration

### 11.2 Performance Targets

| Metric | Target | Tool |
|--------|--------|------|
| LCP (Largest Contentful Paint) | < 1.5s | Lighthouse |
| FID (First Input Delay) | < 100ms | Lighthouse |
| CLS (Cumulative Layout Shift) | < 0.1 | Lighthouse |
| TTFB (Time to First Byte) | < 200ms | WebPageTest |
| Page Size | < 500KB (initial) | Lighthouse |
| Lighthouse Score | > 90 (all categories) | Lighthouse |

### 11.3 Performance Strategies

- Next.js Image component with Cloudflare Images CDN
- Lazy loading for below-fold images and iframes
- Font subsetting for SolaimanLipi (only needed glyphs)
- Font display: swap
- Code splitting by route
- Preload critical resources
- Cloudflare caching rules (static assets: 1 year, HTML: revalidate)
- ISR (Incremental Static Regeneration) for content pages
- Bundle analysis and tree shaking

---

## 12. DEPLOYMENT & CI/CD PIPELINE (GITHUB)

### 12.1 GitHub Repository Structure

```
Branches:
|-- main          -> Production (auto-deploy to Cloudflare Pages)
|-- staging       -> Staging environment
|-- develop       -> Integration branch
+-- feature/*     -> Feature branches (PR to develop)
```

### 12.2 GitHub Actions Workflows

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test:unit
      - run: npm run build

# .github/workflows/deploy.yml
name: Deploy to Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: dutimz-news
          directory: dist
      - name: Deploy Workers
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### 12.3 Environment Variables

```bash
# .env.local (development)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_PAGES_PROJECT=dutimz-news

# R2 (if used for backup storage)
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=dutimz-media
R2_ENDPOINT=...

# Optional: External services
WHATSAPP_API_KEY=...
SENDGRID_API_KEY=...
TTS_API_KEY=...
```

---

## 13. SECURITY REQUIREMENTS

### 13.1 Essential Security Measures

- [ ] **HTTPS Only**: All traffic over TLS 1.3
- [ ] **CORS**: Strict origin policy on API
- [ ] **CSP Headers**: Content Security Policy to prevent XSS
- [ ] **Rate Limiting**: Per-IP and per-user rate limits
- [ ] **Input Sanitization**: DOMPurify for HTML content, validate all inputs
- [ ] **SQL Injection Prevention**: Use Supabase client (parameterized queries)
- [ ] **XSS Prevention**: Escape output, CSP, sanitized HTML
- [ ] **CSRF Protection**: SameSite cookies, CSRF tokens for forms
- [ ] **Secure Headers**: HSTS, X-Frame-Options, X-Content-Type-Options
- [ ] **Password Security**: bcrypt hashing (handled by Supabase Auth)
- [ ] **JWT Security**: Short expiry, secure httpOnly cookies
- [ ] **File Upload Security**: Validate type, size, scan for malware
- [ ] **RLS Policies**: Strict database-level access control
- [ ] **Audit Logging**: Log admin actions, content changes
- [ ] **Backup Strategy**: Daily automated backups (Supabase Team plan)

### 13.2 Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: https: blob:;
font-src 'self' https://fonts.gstatic.com;
frame-src 'self' https://www.youtube.com https://player.vimeo.com;
connect-src 'self' https://*.supabase.co https://api.cloudflare.com;
```

---

## 14. TESTING STRATEGY

### 14.1 Testing Levels

| Type | Tool | Coverage Target |
|------|------|-----------------|
| Unit Tests | Vitest + React Testing Library | 70%+ |
| Integration Tests | Vitest + MSW | API handlers |
| E2E Tests | Playwright | Critical user flows |
| Visual Regression | Chromatic/Storybook | UI components |
| Accessibility | axe-core + Lighthouse | WCAG 2.1 AA |
| Performance | Lighthouse CI | Score > 90 |

### 14.2 Critical Test Scenarios

1. User registration -> login -> logout flow
2. Reporter creates content -> submits -> moderator approves -> publishes
3. Visitor reads article -> comments -> receives reply notification
4. Admin changes user role -> permissions update correctly
5. Search returns relevant results with filters
6. Thumbnail upload -> compression -> display
7. Dark mode toggle persists across sessions
8. Language switch updates all content
9. Real-time comment appears without refresh
10. PWA install and offline reading

---

## 15. DEVELOPMENT PHASES & MILESTONES

### Phase 1: Foundation (Week 1-2)
- [ ] Set up GitHub repo with branch protection
- [ ] Initialize Next.js + Tailwind + shadcn/ui project
- [ ] Set up Supabase project with initial schema
- [ ] Configure Cloudflare Pages + Workers
- [ ] Set up CI/CD pipeline
- [ ] Implement design system (colors, typography, glass components)
- [ ] Create base layout (nav, footer, theme toggle)

### Phase 2: Auth & User Management (Week 2-3)
- [ ] Supabase Auth integration
- [ ] Login/Register/Reset password pages
- [ ] Role-based access control
- [ ] Profile management
- [ ] Admin user management dashboard

### Phase 3: Content Core (Week 3-5)
- [ ] Content creation (reporter dashboard)
- [ ] Rich text editor with Bangla support
- [ ] Thumbnail upload + auto-compression
- [ ] Content workflow (draft -> review -> publish)
- [ ] Content listing pages (category, latest)
- [ ] Content detail pages
- [ ] Revision history

### Phase 4: Public Features (Week 5-6)
- [ ] Homepage with all sections
- [ ] Comment system (nested, reactions)
- [ ] Search functionality
- [ ] Bookmark system
- [ ] Social sharing
- [ ] Newsletter subscription

### Phase 5: Advanced Features (Week 6-7)
- [ ] Text-to-Speech
- [ ] Personalization engine
- [ ] Real-time notifications
- [ ] Polls & surveys
- [ ] PWA features
- [ ] Admin analytics dashboard

### Phase 6: Polish & Launch (Week 7-8)
- [ ] SEO optimization
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] Security audit
- [ ] Content seeding
- [ ] Beta testing
- [ ] Production deployment

---

## APPENDIX A: FONT INTEGRATION

### SolaimanLipi Setup

1. Download SolaimanLipi from: https://www.omicronlab.com/bangla-fonts.html
2. Convert to WOFF2 for web: https://github.com/google/woff2
3. Place in `public/fonts/`
4. Configure in Tailwind:

```typescript
// tailwind.config.ts
fontFamily: {
  bangla: ['SolaimanLipi', 'Times New Roman', 'serif'],
  english: ['Times New Roman', 'serif'],
}
```

### Bangla Typography Best Practices

- Line height: 1.7-1.8 (Bangla needs more breathing room)
- Word spacing: Slightly increased for readability
- Font size: Minimum 18px for body text
- Avoid justify alignment (creates gaps in Bangla)
- Use proper Bangla punctuation (। instead of .)

---

## APPENDIX B: SUPABASE STORAGE BUCKET STRUCTURE

```
Buckets:
|-- thumbnails/           -> Public
|   |-- {content_id}/
|   |   |-- thumb.webp
|   |   |-- medium.webp
|   |   |-- large.webp
|   |   +-- og.webp
|   +-- ...
|-- avatars/              -> Public
|   +-- {user_id}.webp
|-- attachments/          -> Public (for admin uploads if needed)
+-- backups/              -> Private
```

---

## APPENDIX C: EXTERNAL API INTEGRATIONS

| Service | Purpose | When to Integrate |
|---------|---------|-------------------|
| **Cloudflare Images** | Image CDN + transforms | Phase 1 |
| **Supabase Auth** | User authentication | Phase 2 |
| **Supabase Storage** | File storage | Phase 3 |
| **Supabase Realtime** | Live updates | Phase 5 |
| **Web Speech API** | Browser TTS | Phase 5 |
| **WhatsApp Business API** | Breaking news alerts | Phase 6 (optional) |
| **SendGrid/Resend** | Email newsletters | Phase 5 |
| **Google Analytics 4** | Traffic analytics | Phase 6 |
| **Cloudflare Turnstile** | Bot protection | Phase 2 |

---

## APPENDIX D: BANGLA CONTENT GUIDELINES

- All primary content must be in Bangla with optional English translation
- URL slugs: Use English transliteration for SEO (e.g., `/news/bangladesh-election-2026`)
- Date format: "৮ সেপ্টেম্বর, ২০২৬" (Bangla numerals and months)
- Time format: "বিকেল ৪:৩০" or 24-hour format
- Currency: "৳" (Taka) with Bangla numerals
- Numbers in content: Use Bangla numerals (০-৯)
- Quotations: Use "..." for English, "..." for Bangla

---

## FINAL NOTES FOR AI AGENT

1. **Start with Phase 1** -- Do not skip foundational setup
2. **Use TypeScript strictly** -- No `any` types, strict mode enabled
3. **Follow Material 3 specs** -- Reference: https://m3.material.io/
4. **Glass morphism is subtle** -- Do not overuse; maintain readability
5. **Bangla first** -- All UI labels must support Bangla; English is secondary
6. **Test RLS policies** -- Verify every policy with actual test cases
7. **Mobile-first** -- Design for 375px width first, then scale up
8. **Accessibility is non-negotiable** -- WCAG 2.1 AA minimum
9. **Performance budget** -- Stay under 500KB initial bundle
10. **Security by default** -- Never disable RLS, never expose service keys client-side
11. **Git workflow** -- Feature branches, PR reviews, no direct pushes to main
12. **Document as you build** -- Update README and inline comments continuously
