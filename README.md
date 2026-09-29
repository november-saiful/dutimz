# DUTIMZ — ঢাকা বিশ্ববিদ্যালয়ের সংবাদমাধ্যম

মোবাইল-প্রথম, বাংলা-শুধু ঢাকা বিশ্ববিদ্যালয় নিউজ পোর্টাল।

## Architecture

- Next.js 15 App Router portal (React + Tailwind + shadcn) deployed to Cloudflare Workers via `@opennextjs/cloudflare`. Every route renders inside the dashboard shell (sidebar + inset header + cards + chart).
- A separate Cloudflare Worker authenticates media requests, resolves every asset through the audited `get_media_asset` database function, and reads/writes a private R2 bucket. Originals are never replaced. When `OPTIMIZE_IMAGES=true`, Cloudflare Images may additionally store a smaller WebP derivative that is used for delivery only, and only after the Worker verifies it is smaller than the source. Cloudflare Images exposes no provable lossless mode, so this is a delivery optimization, not a lossless recompression.
- Supabase Auth (Google only) and Postgres. All production schema edits are committed SQL migrations protected by RLS.
- GitHub Actions is the production release controller: protected `main` merge → CI/type checks/database tests/build → Supabase migrations → media Worker deployment → portal Worker deployment → smoke tests. Disable separate automatic production deployments in both Cloudflare and any linked provider integrations.

## Local development

1. Install Node.js 22+, npm, Docker, and the Supabase CLI.
2. Install dependencies:

   ```bash
   npm ci
   npm ci --prefix worker
   ```

3. Create a Supabase project (or run `supabase start`). Enable **Google only** under Authentication → Providers → Google, and add the local callback URL `http://localhost:3000/auth/callback/` to the Supabase and Google OAuth redirect allowlists.
4. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable/anon key. These are public browser credentials; never put a secret/service-role key in a `NEXT_PUBLIC_` variable or the Git repository.
5. Start the site: `npm run dev`. Local editorial preview content is clearly marked as illustrative. To use live content, migrate/reset the local database and set `NEXT_PUBLIC_DEMO_MODE=false`.
6. Start the local Supabase stack and apply/test migrations with `supabase start`, `supabase db reset`, and `supabase test db`.
7. Preview the Workers runtime with `npm run preview` (builds with OpenNext and serves locally). Wrangler uses local bindings by default. The standalone media service can be run with `npm run dev --prefix worker` once local Worker secrets are configured.

## Supabase configuration

- Initialize/link the production Supabase project in your own environment. Add `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_ACCESS_TOKEN` as protected GitHub production secrets. The production environment must require an explicit approval reviewer.
- Enable the Google Auth provider. Only `openid`, email, and basic profile scopes are needed. Until the `www` redirect rule is active, allow both `https://dutimz.com/auth/callback/` and `https://www.dutimz.com/auth/callback/` in Supabase Auth and the Google OAuth redirect URI list; after enforcing the apex redirect, the apex callback can be the sole site callback. Keep any explicitly configured Supabase custom Auth domain too.
- The schema and authorization policies are in `supabase/migrations`. For local work use `supabase db reset`; never apply ad-hoc production SQL. Do not connect the Google OAuth identity provider to user roles—sign-up defaults to `reader`.
- Administrator rights are configured data, not a race for a single claim. `public.app_settings.bootstrap_admin_emails` holds a comma separated list of the Google addresses that are administrators; migration 007 hands a listed address the `admin` role in the same transaction as its first sign-in, and `public.bootstrap_admin_accounts()` reconciles owners who signed in before the list was configured. A signed-in caller can only ever promote its own listed account, so an ordinary reader cannot use it to hand out rights. Migration 008 folded the retired `initial_admin_email` address into the list and dropped that key, so the list is the only source of administrators — a second setting can no longer disagree with it out of sight.
- The addresses are personal data and this repository is public, so they are not committed. They travel from the `BOOTSTRAP_ADMIN_EMAILS` repository secret into the database through the Supabase management API in the release workflow (`scripts/sync-bootstrap-admins.mjs`), which also fails the release unless every configured address that has an account holds the administrator role. Adding an owner is therefore a secret update plus a release. Removing one never demotes anybody: a role change stays a deliberate, audited `assign_user_role` action. The admin panel reflects all of it: it lists the accounts that hold the administrator role with who last handed it to them, the addresses the release configured (through `admin_bootstrap_addresses()`, which returns nothing to a non-admin) including owners who have not signed in yet, and every recorded role change from `admin_audit_log`. Do not enable anonymous role management.
- Update the quality-gated Google sign-in, RLS, and workflow tests as schema migrations evolve.

## Cloudflare setup

Create a Cloudflare Workers project named `dutimz` and a private R2 bucket named `dutimz-media`. Connect `dutimz.com` to the Worker and configure `media.dutimz.com` to route to the `dutimz-media` Worker. Enable the Cloudflare Images binding for image processing. Keep the Cloudflare Redirect Rule for `www.dutimz.com/*` to `https://dutimz.com/$1` with status 301 as a second layer; the Next.js `middleware.ts` also redirects dynamic requests on the `www` host to the apex. The public `_redirects` file only handles path redirects. The portal Worker itself holds no storage binding: all media is written and served by the media Worker, so the site cannot reach R2 directly.

`wrangler.jsonc` is the source of truth for the portal Worker configuration, which means the Cloudflare dashboard is **not**: non-secret vars live in the file, and anything set only in the dashboard is shadowed rather than merged. Because of that:

- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_MEDIA_URL`, and `NEXT_PUBLIC_DEMO_MODE` are inlined into the bundle **when the build runs**, so the build environment decides them and the identical `vars` in `wrangler.jsonc` are inert for those names (they are kept as documentation). The fallbacks in `lib/site.ts` apply whenever the build exports them empty; empty therefore always means unset, and no workflow should export these as an empty string.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are credentials baked in at build time, so they are not committed. The release workflow calls `scripts/inject-worker-vars.mjs`, which writes them (from the GitHub repository variables or secrets) into an untracked `.env.production` file in the ephemeral runner just before `opennextjs-cloudflare deploy`. Deploying by hand therefore needs those two variables exported, and the script refuses to write them outside CI.
- The deploy step exports those two values as well as writing the file, because a *empty* variable in the environment is inlined as an empty string and wins over `.env.production` — that combination once published a production build that served illustrative content with blank media URLs.
- `env.preview` pins preview deployments to `NEXT_PUBLIC_DEMO_MODE: "true"` and the preview build is given no Supabase credentials at all, so unmerged pull-request code renders demo content and can never read the production database. Set the `PREVIEW_SUPABASE_URL` and `PREVIEW_SUPABASE_ANON_KEY` repository variables to point previews at a staging project instead.
- `open-next.config.ts` is required by the adapter, which refuses to build without it. It configures **no** incremental cache on purpose: this Worker holds no storage binding, so the routes that export `revalidate` are rendered on demand. Add an R2 or KV incremental cache there if regenerating them becomes expensive.
- Media Worker R2 binding: `MEDIA_BUCKET`; Cloudflare Images binding `IMAGES`; public variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `ALLOWED_ORIGINS` (a comma-separated exact-origin allowlist, including both apex and `www` site hosts).
- Worker secret `SUPABASE_JWT_SECRET` is deliberately not used. Verify user access by calling Supabase Auth's `/auth/v1/user` endpoint with the presented bearer token; do not trust unsigned claims.
- Bindings and variables must be configured for production **and** preview environments. Keep a separate staging Supabase project and media bucket when possible.

Configure private Worker keys with Wrangler secrets, not in `wrangler.jsonc`, and leave `OPTIMIZE_IMAGES` at `false` unless you want smaller delivery derivatives. Disable the zone's **Email Address Obfuscation** (Scrape Shield) so the published contact address stays readable rather than being rewritten into a `/cdn-cgi/l/email-protection` link.

Configure the GitHub Actions repository variables (or secrets, the release workflow accepts either) `SUPABASE_URL` and `SUPABASE_ANON_KEY`, and the protected secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `BOOTSTRAP_ADMIN_EMAILS` (the comma separated list of the portal owners' Google addresses). Use a least-privilege Cloudflare token limited to the needed Workers/R2/Images resources. The Worker’s dashboard-based **Builds/automatic production deployments must be disabled** so GitHub Actions is the single trigger.

The release ends with `scripts/verify-live-config.mjs`, which polls the live configuration (a deployment serves requests before it serves its own configuration) and then repeats a signed-out visitor's anonymous reads against Supabase REST. That last part is not decoration: a row level security policy that calls a function the `anon` role cannot execute refuses the entire query with `42501`, so a missing `grant execute` takes the whole public feed down while the site still returns HTTP 200. Run it locally with `node scripts/verify-live-config.mjs`.

It checks the public domain first and, when that domain is still serving a previous project — moving a custom domain between Pages and a Worker is a manual Cloudflare step, not a build failure — falls back to the address Cloudflare gives the Worker itself and reports the exact action as a warning. A deployment that answers on neither host, or that serves demo content, still fails the release, so a red run always means something is genuinely broken.

## Important MVP business rules

- Reporter fees are issued exactly once on the first successful publication: junior ৳৯০, general ৳১১৫, executive ৳১৪০. Only assigned reporters earn article fees; a moderator receives a fee only when separately assigned a reporter tier.
- Profile details below ১০০% create held fees; completing every applicable field releases held money.
- Minimum withdrawal ৳৩,০০০; the first successful withdrawal also requires at least ৩৫ distinctly published articles. A pending request reserves balance; admin rejection refunds the reserve.
- Every moderation, role assignment, withdrawal review, and administrative money adjustment requires a logged reason.
- Slugs are generated from the Bengali headline by phonetic transliteration (`slugify_title`), so reporters never type one: `ঢাকা` becomes `dhaka`, `সংবাদ` becomes `songbad`. A headline already in use claims the next numeric suffix. A published address never changes, so links keep working after a correction.
- Corrections transparency: every edit to a published story is public at `/corrections/` with its reason, editor label, and whether the headline or body changed. The raw revision history stays private and is exposed only through the `list_corrections` function.
- R2 originals are never replaced, renamed, or overwritten. A derivative is stored only when `OPTIMIZE_IMAGES=true` and the transformed output is verified smaller; unsupported media stays unchanged.
