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

Create a Cloudflare Pages project named `dutimz` (production branch `main`) and a private R2 bucket named `dutimz-media`. Connect `dutimz.com` to the Pages project and configure `media.dutimz.com` to route to the `dutimz-media` Worker. Enable the Cloudflare Images binding for image processing. The Pages project itself holds no storage binding: all media is written and served by the Worker, so the site cannot reach R2 directly.

`wrangler.jsonc` is the source of truth for the Pages project configuration, which means the Cloudflare dashboard is **not**: a deployment reads the variables in `env.production`, and anything set only in the dashboard is shadowed rather than merged. `wrangler pages download config dutimz` prints what a project actually has. Because of that:

- Everything except credentials lives in `wrangler.jsonc`: `SITE_URL`, `MEDIA_URL`, `MEDIA_WORKER_URL`, `PUBLIC_DEMO_MODE`.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are credentials, so they are not committed. The release workflow calls `scripts/inject-pages-vars.mjs`, which folds them (from the GitHub repository variables or secrets) into `wrangler.jsonc` in the ephemeral runner just before `wrangler pages deploy`. Deploying by hand therefore needs those two variables exported, and the script refuses to write them into a tracked file outside CI.
- `env.preview` pins preview deployments to `PUBLIC_DEMO_MODE: "true"` so unmerged pull-request code can never read the production database.
- Media Worker R2 binding: `MEDIA_BUCKET`; Cloudflare Images binding `IMAGES`; public variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `ALLOWED_ORIGIN`.
- Worker secret `SUPABASE_JWT_SECRET` is deliberately not used. Verify user access by calling Supabase Auth's `/auth/v1/user` endpoint with the presented bearer token; do not trust unsigned claims.
- Bindings and variables must be configured for production **and** preview environments. Keep a separate staging Supabase project and media bucket when possible.

Configure private Worker keys with Wrangler secrets, not in `wrangler.jsonc`, and leave `OPTIMIZE_IMAGES` at `false` unless you want smaller delivery derivatives. Disable the zone's **Email Address Obfuscation** (Scrape Shield) so the published contact address stays readable rather than being rewritten into a `/cdn-cgi/l/email-protection` link.

Configure GitHub Actions environment variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MEDIA_URL`, `MEDIA_WORKER_URL`, and the protected secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`. Use a least-privilege Cloudflare token limited to the needed Pages/Workers/R2/Images resources. The Pages project’s dashboard-based **Builds/automatic production deployments must be disabled** so GitHub Actions is the single trigger.

The release ends with `scripts/verify-live-config.mjs`, which polls the live configuration (a deployment serves requests before it serves its own configuration) and then repeats a signed-out visitor's anonymous reads against Supabase REST. That last part is not decoration: a row level security policy that calls a function the `anon` role cannot execute refuses the entire query with `42501`, so a missing `grant execute` takes the whole public feed down while the site still returns HTTP 200. Run it locally with `node scripts/verify-live-config.mjs`.

## Important MVP business rules

- Reporter fees are issued exactly once on the first successful publication: junior ৳৯০, general ৳১১৫, executive ৳১৪০. Only assigned reporters earn article fees; a moderator receives a fee only when separately assigned a reporter tier.
- Profile details below ১০০% create held fees; completing every applicable field releases held money.
- Minimum withdrawal ৳৩,০০০; the first successful withdrawal also requires at least ৩৫ distinctly published articles. A pending request reserves balance; admin rejection refunds the reserve.
- Every moderation, role assignment, withdrawal review, and administrative money adjustment requires a logged reason.
- Slugs are generated from the Bengali headline by phonetic transliteration (`slugify_title`), so reporters never type one: `ঢাকা` becomes `dhaka`, `সংবাদ` becomes `songbad`. A headline already in use claims the next numeric suffix. A published address never changes, so links keep working after a correction.
- Corrections transparency: every edit to a published story is public at `/corrections/` with its reason, editor label, and whether the headline or body changed. The raw revision history stays private and is exposed only through the `list_corrections` function.
- R2 originals are never replaced, renamed, or overwritten. A derivative is stored only when `OPTIMIZE_IMAGES=true` and the transformed output is verified smaller; unsupported media stays unchanged.
