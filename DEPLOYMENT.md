# Deployment Guide — GitHub ⇄ Supabase ⇄ Cloudflare

This repo deploys itself from GitHub Actions:

| Workflow | What it does | Trigger |
|---|---|---|
| `ci.yml` | lint + type-check + tests + build | every push / PR |
| `deploy-pages.yml` | builds & deploys the Next.js app to **Cloudflare Pages** | push to `main`, PRs (preview) |
| `deploy-worker.yml` | deploys the edge API (`workers/`) to **Cloudflare Workers** | push to `main` touching `workers/**` |
| `supabase-migrate.yml` | applies `supabase/migrations/*.sql` to **Supabase** | push to `main` touching `supabase/migrations/**` |

All deploy workflows are **off by default**. They activate only after you add
the secrets below and flip the enable switches — so the first pushes won't fail
while you're still setting accounts up.

---

## 1. Supabase

### 1.1 Create the project
1. Sign in at <https://supabase.com/dashboard> → **New project**.
2. Pick a region close to Bangladesh (`ap-southeast-1` Singapore is usually best).
3. Save the **database password** somewhere safe — it becomes
   `SUPABASE_DB_PASSWORD` below.

### 1.2 Collect the values
From **Project Settings → API**:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Project ref** (the `xxxx` in `https://xxxx.supabase.co`) → `SUPABASE_PROJECT_ID`

From **Project Settings → Database → Connection string → URI**:
- Note the DB password you saved → `SUPABASE_DB_PASSWORD`

From <https://supabase.com/dashboard/account/tokens>:
- Generate a personal access token → `SUPABASE_ACCESS_TOKEN`

### 1.3 Enable Google Auth (Phase 2 login)
**Authentication → Providers → Google**: enable it, paste a Google OAuth
client id/secret (create one at <https://console.cloud.google.com/apis/credentials>),
and add the redirect URI:
```
https://<project-ref>.supabase.co/auth/v1/callback
```

### 1.4 Wire it to GitHub
Repo → **Settings → Secrets and variables → Actions**:

**Secrets** (Repository secrets):
| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | personal access token from 1.2 |
| `SUPABASE_DB_PASSWORD` | database password from 1.1 |
| `NEXT_PUBLIC_SUPABASE_URL` | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |

**Variables** (Repository variables):
| Name | Value |
|---|---|
| `SUPABASE_PROJECT_ID` | project ref (e.g. `abcdefghijklmnop`) |
| `SUPABASE_DEPLOY_ENABLED` | `true` |

That's it — the next push to `main` that touches `supabase/migrations/**`
applies the schema automatically (or run the *Migrate Database* workflow
manually via **Actions → Migrate Database → Run workflow**).

> Prefer clicking? You can instead run `supabase link --project-ref <ref>`
> then `supabase db push` locally — the migrations are identical.

---

## 2. Cloudflare

### 2.1 Create the Pages project (one-time)
1. <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages →
   Create using Direct Upload** (the actual upload comes from CI; we only
   need the project to exist).
2. Name it `dutimz-news` (or anything — set it as `CF_PAGES_PROJECT` below).

### 2.2 Create an API token
<https://dash.cloudflare.com/profile/api-tokens> → **Create Token** →
use the **"Cloudflare Pages — Edit"** template, then **add** these extra
permissions so the same token can deploy the worker:
- `Account → Cloudflare Pages → Edit`
- `Account → Workers Scripts → Edit`

Copy the token → `CLOUDFLARE_API_TOKEN`. Also grab your **Account ID**
(right sidebar of any Cloudflare dashboard page) → `CLOUDFLARE_ACCOUNT_ID`.

### 2.3 Wire it to GitHub
Repo → **Settings → Secrets and variables → Actions**:

**Secrets**:
| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token from 2.2 |
| `CLOUDFLARE_ACCOUNT_ID` | account id |

**Variables**:
| Name | Value |
|---|---|
| `CLOUDFLARE_DEPLOY_ENABLED` | `true` |
| `CF_PAGES_PROJECT` | `dutimz-news` (only if you named it differently) |

### 2.4 Production domain
After the first deploy, set the Pages custom domain (e.g. `dutimz.com`) in
**Pages → dutimz-news → Custom domains**. Cloudflare manages DNS + TLS
automatically if the zone is on the same account.

---

## 3. First deploy checklist

1. All secrets/variables from §1.4 and §2.3 are in place.
2. Push to `main` (already done — see below). Check the **Actions** tab:
   - `CI` must be green.
   - `Deploy Web (Cloudflare Pages)` uploads the site.
   - `Migrate Database (Supabase)` applies migrations 0001→0005 and seeds.
3. Add the two public env values to the **Pages project**
   (Pages → dutimz-news → Settings → Environment variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (They're baked at build time — the workflow already passes them, so this
   is only needed for dashboard-triggered builds.)
4. Visit the Pages URL — the portal should render with real data.

## 4. Where each secret lives (summary)

| Value | Local dev (`cp .env.example .env.local`) | GitHub |
|---|---|---|
| Supabase URL | `NEXT_PUBLIC_SUPABASE_URL` | secret of the same name |
| Supabase anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | secret of the same name |
| Supabase service role | `SUPABASE_SERVICE_ROLE_KEY` (server-only scripts) | — (avoid unless needed) |
| DB password | — | `SUPABASE_DB_PASSWORD` |
| Access token | — | `SUPABASE_ACCESS_TOKEN` |
| Cloudflare | `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` in `.env.local` for `wrangler` CLI use | same-name secrets |

## 5. Rolling back

- **App**: Pages → Deployments → previous deployment → **Rollback**.
- **Worker**: re-run an earlier commit of `deploy-worker.yml`, or
  `wrangler rollback` from the `workers/` directory.
- **Database**: migrations are forward-only by design; write a new
  `000N_*.sql` that reverses the change. `supabase db reset` is for local
  development only.
