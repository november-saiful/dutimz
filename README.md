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

## Roadmap

- [x] **Phase 1 — Foundation**: design system, base layout, homepage, detail pages, schema, RLS, indexes, worker skeleton, CI
- [x] **Phase 2 — Auth & users**: Google OAuth, role-based middleware, profile page, RBAC helpers, auth triggers
- [x] **Phase 3 — Content core**: editor, workflow, uploads, revisions
- [ ] **Phase 4 — Public features**: comments, search, bookmarks, sharing
- [ ] **Phase 5 — Advanced**: TTS, personalization, realtime, PWA, analytics
- [ ] **Phase 6 — Polish & launch**: SEO/perf/accessibility audits, deployment

See `dutimz-ai-agent-build-instructions.md` for the full specification.
