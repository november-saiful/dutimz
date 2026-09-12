# DUTIMZ News Portal — ঢাকা ইউনিভার্সিটি টাইম্‌জ

A production-ready, Bangla-first bilingual (Bangla/English) news portal:
text news, video news, articles and documentaries.

- **Frontend**: Next.js 14 (App Router) on Cloudflare Pages
- **Edge API**: Cloudflare Workers (`workers/`)
- **Database/Auth/Storage**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Design**: Material 3 + Google Neural Expressive + Glass Morphism
- **Typography**: Noto Serif Bengali (Bangla, self-hosted via `next/font`) · Times New Roman (English)

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev                  # http://localhost:3000
```

Without Supabase env vars the app runs on mock data so every page is navigable.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript strict check |
| `npm run test:unit` | Vitest unit tests |
| `npm run worker:dev` | Cloudflare Worker (edge API) locally |

## Database

```bash
supabase link --project-ref <ref>
supabase db push        # applies supabase/migrations/*
supabase db reset       # recreate + seed
```

Migrations: `0001_init.sql` (schema) → `0002_rls.sql` (row level security) →
`0003_indexes.sql` (performance) → `0004_auth.sql` (profile trigger, role sync,
hardened profile RLS) → `0005_content_workflow.sql` (thumbnails storage bucket,
workflow transition guard, version bump trigger). Seed data in
`supabase/seed.sql`.

## Content workflow (Phase 3)

Reporters draft stories in a rich text editor with first-class Bangla support;
moderators review and publish them. Highlights:

- **Editor** — dependency-free `contentEditable` layer (works with Avro/Probhat
  IMEs), per-selection `lang`/`dir` tagging (বাং / EN buttons), Bangla numeral
  word counter, plain-text paste, whitelisted HTML output.
- **Workflow** — `draft → pending_review → published`, with reject / request
  changes / unpublish / archive. The state machine lives in
  `src/lib/content/workflow.ts` and is enforced twice: in the API routes and
  again by the `content_transition_guard` trigger in migration 0005.
- **Thumbnails** — client-side canvas compression to WebP (≤1600px) then
  upload to the public `thumbnails` Supabase Storage bucket
  (`src/lib/upload/image.ts`). Data-URL fallback keeps the flow working in
  mock mode.
- **Revisions** — every accepted edit writes a `content_revisions` row holding
  a field diff, a snapshot, the acting editor and an optional note. The
  editor page can preview and restore any prior version (restore itself
  writes a new revision — nothing is destructive).
- **Sanitization** — editor HTML is sanitized server-side with
  DOMPurify (`src/lib/content/sanitize.ts`) before public rendering.

Routes: `/reporter` (desk), `/reporter/contents/new`, `/reporter/contents/[id]`,
`/moderator` (review queue). APIs: `/api/reporter/contents[/id]`,
`/api/reporter/revisions`, `/api/moderator/queue`. Without Supabase env vars
the whole flow runs against an in-memory mock store seeded with demo stories.

## Auth (Phase 2)

Google-only OAuth via Supabase Auth. Enable the Google provider in the
Supabase dashboard (see `.env.example` for the redirect URI). Highlights:

- `src/middleware.ts` — refreshes sessions and guards routes by role
  (`/profile` and `/bookmarks` need any user; `/reporter/*`, `/moderator/*`,
  `/admin/*` need the matching role; insufficient role → `/auth/forbidden`).
- `src/lib/auth/rbac.ts` — role hierarchy helpers + route table (unit tested).
- `src/lib/auth/server.ts` — `getAuthUser` / `getAuthProfile` / `requireAuth`
  server helpers for pages and actions.
- `supabase/migrations/0004_auth.sql` — auto-creates `profiles` rows on first
  sign-in, keeps `updated_at` fresh, mirrors role changes into the JWT
  (`raw_user_meta_data.role`) so middleware needs no DB call, and blocks
  users from promoting themselves via the profile update policy.

## Structure

```
src/app/(public)/       Homepage, news/articles/documentaries/[slug], category, search, auth
src/components/         glass/ (cards, ticker) · content/ · navigation/ · forms/
src/lib/data/           queries (Supabase w/ mock fallback), mock seed content
src/lib/i18n/           dictionary (bn/en), server locale helper
src/lib/supabase/       browser / server / admin clients
src/stores/             zustand: theme, ui, locale
supabase/migrations/    schema, RLS, indexes
workers/                Cloudflare Worker edge API
tests/unit/             vitest specs
```

## Phase 4 — Public features

- **Comments** — nested/threaded with like/dislike reactions, inline reply forms,
  moderation status. Bilingual, glass-themed. API: `/api/comments`, `/api/comments/react`.
- **Search** — full-text search with `pg_trgm` + `tsvector` indexes (migration 0006),
  mock fallback with fuzzy substring matching. Scored results (title > excerpt > body).
- **Bookmarks** — save/unsave articles with optimistic UI, dedicated `/bookmarks` page.
  API: `/api/bookmarks`.
- **Social sharing** — Facebook, X, WhatsApp, copy-to-clipboard. Integrated into article pages.
- **Newsletter** — subscription form wired to `/api/newsletter/subscribe`.

Migration: `0006_public_features.sql` (comments, comment_reactions, bookmarks,
newsletter_subscribers, trigram + GIN indexes, RLS policies).

## Phase 5 — Advanced features

- **Text-to-Speech** — Web Speech API with Bangla/English voice selection, speed
  control (0.75x–2x), progress bar. Collapsible UI in article pages.
- **Personalization** — localStorage reading history with exponential decay scoring,
  category interest tracking, content recommendations. `ReadTracker` records views.
- **Notifications** — bell icon with unread badge, dropdown with sample notifications.
- **Polls & Surveys** — interactive poll widget with animated result bars, voting API.
  Two seed polls on homepage.
- **PWA** — enhanced manifest (shortcuts, categories, maskable icons), service worker
  (`/sw.js`) with cache-first for assets, network-first for pages, Bangla offline page.
- **Admin Analytics** (`/admin`) — view counts, trending content, category engagement
  charts, weekly views bar graph. Bilingual.

## Phase 6 — Polish & launch

### SEO

- `robots.txt` — auto-generated via Next.js route handler (`src/app/robots.ts`).
  Allows public pages, blocks admin/reporter/moderator desks and API routes.
- `sitemap.xml` — auto-generated (`src/app/sitemap.ts`), includes all published
  articles, category pages, and static pages. Priority-weighted by content type.
- Structured data (JSON-LD) — Organization (NewsMediaOrganization), WebSite
  (with SearchAction), BreadcrumbList, NewsArticle schemas.
  See `src/lib/seo/structuredData.ts`.
- OpenGraph + Twitter cards on all detail pages.

### Performance

- Dynamic imports for heavy client components (HomeSections, HaloReel).
- `next/font` self-hosted Noto Serif Bengali (woff2, subset bengali+latin).
- Image optimization: AVIF/WebP format preference, Unsplash remote patterns.
- `prefers-reduced-motion` respected globally.

### Accessibility

- WCAG 2.1 AA: `:focus-visible` outlines on all interactive elements.
- Skip-to-content link in root layout.
- `aria-label`, `aria-expanded`, `aria-roledescription` on all controls.
- Bilingual `sr-only` labels on all form inputs.
- Print-friendly styles (hides nav, glass effects).

### Security

- CSP headers via Next.js `headers()` config (script-src, style-src, img-src,
  connect-src, frame-src, permissions-policy).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`.
- `X-XSS-Protection: 1; mode=block`.
- `Permissions-Policy`: camera/microphone denied by default, interest-cohort opted out.
- `Referrer-Policy: strict-origin-when-cross-origin`.

### Content seeding

- `scripts/seed-content.sql` — 10 realistic Bengali articles with full body HTML,
  unique Unsplash thumbnails, category assignments. Run after migrations.

## Deployment

### Prerequisites

1. **Supabase project** — create at https://supabase.com
2. **Cloudflare account** — Pages + Workers
3. **GitHub repo** — november-saiful/dutimz (connected)

### Step 1: Supabase

```bash
# Install Supabase CLI
npm i -g supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Push all migrations (0001–0006)
supabase db push

# Seed content
psql $DATABASE_URL < scripts/seed-content.sql

# Enable Google Auth provider in Supabase Dashboard → Authentication → Providers
```

### Step 2: Environment Variables

Add to **GitHub repo → Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `SUPABASE_ACCESS_TOKEN` | From supabase.com dashboard → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Database password from project settings |
| `SUPABASE_PROJECT_ID` | Project reference ID |
| `CLOUDFLARE_API_TOKEN` | From Cloudflare dashboard → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | From Cloudflare dashboard sidebar |

Add to **GitHub repo → Settings → Secrets and variables → Actions → Variables**:

| Variable | Value |
|----------|-------|
| `SUPABASE_DEPLOY_ENABLED` | `true` |
| `CLOUDFLARE_DEPLOY_ENABLED` | `true` |

### Step 3: Deploy

Push to `main` — all three workflows trigger automatically:

1. **CI** — lint, type-check, tests, build (always runs)
2. **Supabase Migrate** — applies migrations (when enabled)
3. **Deploy Pages** — builds and deploys to Cloudflare Pages (when enabled)

Or trigger manually from the Actions tab.

### Step 4: Post-deploy

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as
   **Cloudflare Pages environment variables** (Settings → Environment variables)
   so the edge runtime can reach Supabase.
2. Update `SITE.url` in `src/lib/constants/app.ts` to your production domain.
3. Submit `https://dutimz.com/sitemap.xml` to Google Search Console.

## Roadmap

- [x] **Phase 1 — Foundation**: design system, base layout, homepage, detail pages, schema, RLS, indexes, worker skeleton, CI
- [x] **Phase 2 — Auth & users**: Google OAuth, role-based middleware, profile page, RBAC helpers, auth triggers
- [x] **Phase 3 — Content core**: editor, workflow, uploads, revisions
- [x] **Phase 4 — Public features**: comments, search, bookmarks, sharing
- [x] **Phase 5 — Advanced**: TTS, personalization, realtime, PWA, analytics
- [x] **Phase 6 — Polish & launch**: SEO/perf/accessibility/security audits, content seeding, deployment guide

See `dutimz-ai-agent-build-instructions.md` for the full specification.

## Live

- **Production**: https://dutimz-news.pages.dev
- **Supabase Dashboard**: https://supabase.com/dashboard/project/bccikoroyovmlpzikinf
