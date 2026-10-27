# Deployment

**Status:** workflows and runbook ready (2026-10-21). Nothing is deployed and no
Cloudflare, DNS or database change is made without the owner's explicit
approval.

## Environments

| Environment | Purpose | Public? |
|-------------|---------|---------|
| Local | Development and tests | No |
| Preview | Testing changes before production | No — behind Cloudflare Access, `noindex` |
| Production | The public websites (www.hantexultra.com first) and the dashboard | Public sites only |

Each environment has its own Neon database branch, R2 buckets and secrets;
production data is never used in development or tests.

## Cloudflare resources (Free plan, D-008)

| Resource | Use |
|----------|-----|
| Worker per site, `site-<key>` (D-028, confirmed) | One public site each: static pages from the site engine (`apps/web`) and its form endpoints. The first is `site-hantex-ultra` for www.hantexultra.com. |
| Worker `hantex-admin` | Dashboard (React app) and its API (Hono) on `admin.hantexultra.com`, managing every site |
| Hyperdrive | Database connections: the public-site user (insert-only sign-ups) for site Workers, uncached for the dashboard |
| R2 bucket `media` | Approved photos, 3D models and documents for all sites, served through a media domain per site (for example `media.hantexultra.com`) |
| R2 bucket `studio` (private) | 3D Studio originals, CAD files, intermediate files and unapproved models ([`3d-product-studio.md`](3d-product-studio.md)) |
| R2 bucket `backups` (private) | Encrypted nightly database exports (D-010) |
| R2 bucket `hantex-media` (private) | The media library (D-044): every upload, under `private/<site id>/<image>/<width>.webp`. Bound to the dashboard Worker only (`MEDIA`) |
| R2 bucket `hantex-media-public` | Copies of published images under `sites/<site key>/…`, which each site's Worker serves as `/media/<image>/<width>.webp`, short-lived preview copies under `preview/<site key>/…`, served only through signed links, and uploaded fonts under `fonts/<font>/…`, which every site serves as `/fonts/library/<font>/<weight>.woff2`. The dashboard Worker writes it (`MEDIA_PUBLIC`); site Workers read it (`MEDIA`). No public bucket address or custom domain is needed. **Lifecycle rule (added once by the owner):** delete objects under `preview/` after 1 day |
| Turnstile | Spam protection on sign-up and sign-in |
| Cloudflare Access (Zero Trust free) | Second lock in front of the dashboard and previews |
| Workers Logs, Cron Triggers | Monitoring, health checks, scheduled publishing. The Free plan allows 5 Cron Triggers per account, so one shared schedule serves all sites. |

## DNS (each change proposed first, applied only after approval)

- `www.hantexultra.com` → `site-hantex-ultra` (custom domain).
- `hantexultra.com` → redirect to `https://www.hantexultra.com`.
- `admin.hantexultra.com` → `hantex-admin`, behind Cloudflare Access.
- `media.hantexultra.com` → R2 `media` bucket (custom domain, cached).
- Email sending records for Resend (SPF, DKIM, DMARC).
- **Each new site:** its domains and media domain are entered in the
  dashboard as *pending*. They are applied only by a production deployment
  the owner approves. The dashboard has no Cloudflare credentials and cannot
  change DNS itself.

## Database (Neon, D-003 and D-010)

**PostgreSQL 18**: Neon's default for new projects since June 2026
([Neon changelog](https://neon.com/docs/changelog/2026-06-05)). CI and local
development use the same major version (D-023).

**Host decided (D-047):** Neon's free plan: 0.5 GB storage and 100
compute-hours a month per project, 10 branches, compute that sleeps after 5
minutes idle (the first request after a quiet spell wakes it), 5 GB network
transfer a month ([Neon plans](https://neon.com/docs/introduction/plans)).
Files are in R2, so the database holds only content and settings.

**Linked project:** `neon.ts` declares the Neon services (Postgres only), and
`neon init` links this repository to the Hantex project (`.neon`,
git-ignored). `neon deploy` applies `neon.ts` to the linked branch and writes
`DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct) and `NEON_BRANCH`
to `.env.local`, which is git-ignored and never committed. The database
scripts (`migrate`, `roles`, `seed`, `setup-owner`) use the direct
connection from it when none is set in the environment, and print the Neon
branch they are about to change. The production branch is in AWS
`us-east-2`.

Branches: production, preview, development. Database users with least
privilege: migrations (schema changes), dashboard (read/write), public site
(insert sign-ups, read published content only), backups (read-only).
Migrations run from CI, never from a running Worker. Database users are
`hantex_admin_app`, `hantex_public_app`, `hantex_build` and `hantex_backup`,
created and granted by `pnpm --filter @hantex/db roles` (passwords from
environment variables, never stored in the repository).

## CI/CD (GitHub Actions)

| Workflow | When | What it does |
|----------|------|--------------|
| `ci.yml` | Every pull request and push to `main` | Format, lint, type check, unit, database and API tests, build, Worker size check against the Free plan limit, home-page weight budget (30 KB code, 200 KB fonts), browser tests (dashboard passkeys and phone sizes, public site) with axe accessibility checks, dependency audit. Node.js 26, pnpm 12, PostgreSQL 18 (D-023). |
| `deploy.yml` | **By hand only**, in the `production` environment, which must require the owner's approval | `database`: migrations, database users and grants, standard roles, the first site. `dashboard`: builds and deploys `hantex-admin` and sets its secrets. `site`: a site's first deployment, or new secrets for it. |
| `publish.yml` | Started by the dashboard's Publish button (D-006) | Builds **one site** from its published content with the read-only build user and deploys that site's Worker, then reports the result to the dashboard. |

- No workflow changes DNS. Each domain is connected separately, after the
  owner approves it.
- The dashboard's GitHub token (`PUBLISH_TRIGGER_TOKEN`) can only start
  workflows in this repository. It could start `deploy.yml`, but that
  workflow waits for the owner's approval, so the token alone can't change
  production.
- This repository is public, so workflow logs are public: builds read no
  personal data (the build user can't), secrets are masked, and nothing
  sensitive is uploaded as an artifact.
- **`backup.yml` (nightly, D-010):** exports the whole database as the
  read-only `hantex_backup` user with `pg_dump` 18, streams it straight into
  `age` encryption (the plain export never touches the disk), and uploads it to
  the private R2 bucket under `daily/`, plus `monthly/` on the 1st. Retention is
  an R2 lifecycle rule the owner adds once: delete `daily/` after 30 days and
  `monthly/` after 365 days. Only the owner holds the age *private* key,
  offline; the workflow has only the public key. Restore:
  `age -d -i key.txt file.dump.age | pg_restore --no-owner -d <database>`,
  rehearsed on a Neon branch, never on production.
- **`health.yml` (every 30 minutes, D-011):** the public sites must answer
  200, and the dashboard must answer below 400 (a Cloudflare Access sign-in
  redirect counts as up).
- Both are skipped, with a notice, until their configuration exists. A failed
  run emails whoever GitHub's notification settings name (the owner's
  account: Settings → Notifications → Actions → "only failed workflows").
- **3D Studio processing (D-030, confirmed):** photo reconstruction,
  optimisation, validation and poster rendering run on a *processing runner*
  on the owner's own Mac or PC. It never runs in this public repository,
  whose logs and artifacts anyone can read. No paid AI providers are called.

## Configuration (names only; values are never written here)

**GitHub secrets** (Settings → Secrets and variables → Actions):

| Name | Used by | What it is |
|------|---------|------------|
| `CLOUDFLARE_API_TOKEN` | deploy, publish | Cloudflare token limited to editing Workers on this account |
| `DATABASE_URL` | deploy (database) | Neon owner connection, for migrations only |
| `HANTEX_ADMIN_APP_PASSWORD`, `HANTEX_PUBLIC_APP_PASSWORD`, `HANTEX_BUILD_PASSWORD`, `HANTEX_BACKUP_PASSWORD` | deploy (database) | Passwords for the four least-privilege database users |
| `HANTEX_BUILD_DATABASE_URL` | deploy (site), publish | Connection as the read-only build user |
| `BETTER_AUTH_SECRET`, `TOKEN_HASH_SECRET`, `PREVIEW_SIGNING_SECRET`, `UNSUBSCRIBE_SECRET` | deploy | Random secrets (32 bytes or more); the preview and unsubscribe secrets go to the dashboard and every site Worker |
| `TURNSTILE_SECRET_KEY` | deploy | Turnstile secret key |
| `RESEND_API_KEY` | deploy (dashboard) | Email sending (D-009) |
| `PUBLISH_TRIGGER_TOKEN` | deploy (dashboard) | GitHub fine-grained token for this repository with Actions: read and write only |
| `PUBLISH_CALLBACK_SECRET` | deploy, publish | Random secret the publish workflow uses to report results |
| `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET` | publish | Cloudflare Access service token, so the result report can reach the dashboard |
| `BACKUP_DATABASE_URL` | backup | Connection as the read-only `hantex_backup` user |
| `BACKUP_R2_API_TOKEN` | backup | Cloudflare token limited to writing objects in the backups bucket |

**GitHub variables** (not secret): `CLOUDFLARE_ACCOUNT_ID`, `APP_ORIGIN`
(`https://admin.hantexultra.com`), `ADMIN_HYPERDRIVE_ID`,
`SITE_HYPERDRIVE_ID`, `TURNSTILE_SITE_KEY`, `EMAIL_FROM`,
`BACKUP_AGE_RECIPIENT` (the age *public* key; the private key stays offline
with the owner), `BACKUP_BUCKET` (default `backups`), `HEALTH_SITE_URLS`
(space-separated), `HEALTH_DASHBOARD_URL`.

**Optional dashboard variable** (`apps/api`, not secret): `MEDIA_SITE_QUOTA_MB`, the most
media each website may store (default 1024; R2's free plan has 10 GB in total).

**Optional dashboard variable** (`apps/api`, not secret): `ANNOUNCEMENT_DAILY_LIMIT`, the
most announcement emails sent per 24 hours across all websites (default 100). Set it to
your Resend plan's daily limit, which you can see in Resend's dashboard; it couldn't be
checked from the build environment.

**In `apps/web/wrangler.jsonc`** (not secret): `DASHBOARD_ORIGIN`, the
dashboard's address. It is the only page allowed to show a site's draft
previews in a frame (the page editor's device preview); keep it equal to
`APP_ORIGIN`.

**Later phases:** R2 and processing-runner credentials for the 3D Studio; one API key
per 3D provider only after the owner approves it (D-005, D-030).

## Rollback

- Code: redeploy the previous Worker version (Cloudflare keeps versions).
- Database: migrations are backward-compatible (expand, then contract);
  restore from Neon point-in-time or the nightly backup if needed.

## First deployment, step by step

Each step needs the owner. I'll guide each one when we get there; nothing is
deployed before the owner says so.

1. **Neon** (free): create a project with PostgreSQL 18 in a region near the
   visitors. Copy the owner connection string into `DATABASE_URL`.
2. **Passwords and secrets:** on your own computer, in this repository's
   folder, run `bash scripts/first-deploy-secrets.sh` (needs the GitHub CLI,
   signed in as the owner). It asks for the Neon connection string (hidden),
   generates the four database passwords and the random secrets, and stores
   them directly as GitHub secrets, with the build and backup connection
   strings. Nothing passes through chat. It also writes the two Hyperdrive
   connection strings to `.local/hyperdrive-connections.txt` for step 5;
   delete that file afterwards.
3. **GitHub environments** (Settings → Environments), each limited to the
   `main` branch: `production` with the owner as required reviewer, `sites`
   (no reviewer: publishing from the dashboard runs unattended) and `backups`
   (no reviewer). Create `production` **before** the first deployment run: a
   workflow that names a missing environment creates it without protection.
4. **Run `Deploy (production)` → `database`** and approve it. This creates the
   tables, the database users, the standard roles and the Hantex Ultra site
   (Coming Soon, domains pending).
5. **Cloudflare Hyperdrive:** two configurations: the dashboard user with
   caching off, and the public-site user. Put their ids in
   `ADMIN_HYPERDRIVE_ID` and `SITE_HYPERDRIVE_ID`.
6. **Turnstile:** create a widget for `hantexultra.com` and
   `admin.hantexultra.com`; add the keys.
7. **Resend** (free): verify the sending domain (DNS records, approved by the
   owner); add the API key and `EMAIL_FROM`.
8. **Cloudflare Access** (Zero Trust free): an application for
   `admin.hantexultra.com` allowing the owner's email, plus a service token
   for the publish callback (`/api/publish/jobs/*`).
9. **Run `Deploy (production)` → `dashboard`**, then connect
   `admin.hantexultra.com` to the `hantex-admin` Worker (DNS change, approved
   by the owner).
10. **First Owner:** run `setup-owner` with the production database (step
    below) and open the link on your phone or computer to create your
    passkey.
11. **Run `Deploy (production)` → `site`** for `hantex-ultra`, then connect
    `www.hantexultra.com` (and redirect `hantexultra.com`) to
    `site-hantex-ultra` (DNS changes, approved by the owner). The site stays
    in Coming Soon mode.
12. **GitHub token for publishing:** create the fine-grained token
    (`PUBLISH_TRIGGER_TOKEN`) and re-run the dashboard deployment so the
    Publish button can rebuild the site.

First-Owner link: `DATABASE_URL=… APP_ORIGIN=https://admin.hantexultra.com
pnpm --filter @hantex/db setup-owner <your email>`. It works once, expires
after 24 hours, stops working as soon as an Owner exists, and is never
stored.

**For the 3D Studio (Phase 3, D-030):** create a private repository for the
processing runner, or set up the runner on your own computer. Approve any
paid provider before its key is added.
