# DUTIMZ — ঢাকা বিশ্ববিদ্যালয়ের সংবাদমাধ্যম

মোবাইল-প্রথম, বাংলা-শুধু ঢাকা বিশ্ববিদ্যালয় নিউজ পোর্টাল।

## Architecture

- Astro static editorial shell deployed to Cloudflare Pages; Cloudflare Pages Functions power request-time APIs and article/profile pages.
- A separate Cloudflare Worker authenticates media requests, resolves every asset through the audited `get_media_asset` database function, and reads/writes a private R2 bucket. Originals are never replaced. When `OPTIMIZE_IMAGES=true`, Cloudflare Images may additionally store a smaller WebP derivative that is used for delivery only, and only after the Worker verifies it is smaller than the source. Cloudflare Images exposes no provable lossless mode, so this is a delivery optimization, not a lossless recompression.
- Supabase Auth (Google only) and Postgres. All production schema edits are committed SQL migrations protected by RLS.
- GitHub Actions is the production release controller: protected `main` merge → CI/type checks/database tests/build → Supabase migrations → media Worker deployment → Pages deployment → smoke tests. Disable separate automatic production deployments in both Cloudflare and any linked provider integrations.

Astro's current Cloudflare adapter deploys to Workers rather than Pages. This repository intentionally uses a static Astro shell on Pages and the supported Pages Functions runtime for dynamic endpoints. It does not rely on the adapter's retired Pages target.

## Local development

1. Install Node.js 22+, npm, Docker, and the Supabase CLI.
2. Install dependencies:

   ```bash
   npm ci
   npm ci --prefix worker
   ```

3. Create a Supabase project (or run `supabase start`). Enable **Google only** under Authentication → Providers → Google, and add the local callback URL `http://localhost:4321/auth/callback/` to the Supabase and Google OAuth redirect allowlists.
4. Copy `.env.example` to `.env` and set the Supabase project URL and publishable/anon key. These are public browser credentials; never put a secret/service-role key in a `PUBLIC_` variable or the Git repository.
5. Start the site: `npm run dev`. Local editorial preview content is clearly marked as illustrative. To use live content, migrate/reset the local database and set `PUBLIC_DEMO_MODE=false`.
6. Start the local Supabase stack and apply/test migrations with `supabase start`, `supabase db reset`, and `supabase test db`.
7. Preview Cloudflare Pages Functions with `npm run build && npm run preview`. Wrangler uses local bindings by default. The standalone media service can be run with `npm run dev --prefix worker` once local Worker secrets are configured.

## Supabase configuration

- Initialize/link the production Supabase project in your own environment. Add `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_ACCESS_TOKEN` as protected GitHub production secrets. The production environment must require an explicit approval reviewer.
- Enable the Google Auth provider. Only `openid`, email, and basic profile scopes are needed. Set the production site/callback/redirect allowlist for `https://dutimz.com/auth/callback/` and any explicitly configured Supabase custom Auth domain.
- The schema and authorization policies are in `supabase/migrations`. For local work use `supabase db reset`; never apply ad-hoc production SQL. Do not connect the Google OAuth identity provider to user roles—sign-up defaults to `reader`.
- Before any reporter/admin pages are enabled for real users, set `initial_admin_email` in `public.app_settings` using the protected Supabase SQL editor. After the chosen Google account signs in, that account must call `bootstrap_first_admin` to claim the single initial administrator. The function can run only once, requires an exact email match, is audited, and the claimed flag is then permanently set. Do not enable anonymous role management.
- Update the quality-gated Google sign-in, RLS, and workflow tests as schema migrations evolve.

## Cloudflare setup

Create a Cloudflare Pages project named `dutimz` and a private R2 bucket named `dutimz-media`. Connect `dutimz.com` to the Pages project and configure `media.dutimz.com` to route to the `dutimz-media` Worker. Bind the same bucket as `MEDIA_BUCKET` to the Pages project and Worker. Enable the Cloudflare Images binding for image processing.

Configure Pages production/preview bindings from `wrangler.jsonc`; configure private Worker keys with Wrangler secrets, not in `wrangler.jsonc`. Supabase credentials are deliberately not committed, so set `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the Pages project for **both** production and preview in the Cloudflare dashboard (or with `wrangler pages secret put`), and leave `OPTIMIZE_IMAGES` at `false` unless you want smaller delivery derivatives. Set:

- Pages bindings: `MEDIA_BUCKET` to the created R2 bucket; variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`, `MEDIA_URL`, `MEDIA_WORKER_URL`.
- Media Worker R2 binding: `MEDIA_BUCKET`; Cloudflare Images binding `IMAGES`; public variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `ALLOWED_ORIGIN`.
- Worker secret `SUPABASE_JWT_SECRET` is deliberately not used. Verify user access by calling Supabase Auth's `/auth/v1/user` endpoint with the presented bearer token; do not trust unsigned claims.
- Bindings and variables must be configured for production **and** preview environments. Keep a separate staging Supabase project and media bucket when possible.

Configure GitHub Actions environment variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MEDIA_URL`, `MEDIA_WORKER_URL`, and the protected secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`. Use a least-privilege Cloudflare token limited to the needed Pages/Workers/R2/Images resources. The Pages project’s dashboard-based **Builds/automatic production deployments must be disabled** so GitHub Actions is the single trigger.

## Important MVP business rules

- Reporter fees are issued exactly once on the first successful publication: junior ৳৯০, general ৳১১৫, executive ৳১৪০. Only assigned reporters earn article fees; a moderator receives a fee only when separately assigned a reporter tier.
- Profile details below ১০০% create held fees; completing every applicable field releases held money.
- Minimum withdrawal ৳৩,০০০; the first successful withdrawal also requires at least ৩৫ distinctly published articles. A pending request reserves balance; admin rejection refunds the reserve.
- Every moderation, role assignment, withdrawal review, and administrative money adjustment requires a logged reason.
- Slugs are generated from the Bengali headline by phonetic transliteration (`slugify_title`), so reporters never type one: `ঢাকা` becomes `dhaka`, `সংবাদ` becomes `songbad`. A headline already in use claims the next numeric suffix. A published address never changes, so links keep working after a correction.
- Corrections transparency: every edit to a published story is public at `/corrections/` with its reason, editor label, and whether the headline or body changed. The raw revision history stays private and is exposed only through the `list_corrections` function.
- R2 originals are never replaced, renamed, or overwritten. A derivative is stored only when `OPTIMIZE_IMAGES=true` and the transformed output is verified smaller; unsupported media stays unchanged.
