# Deployment

**Status:** plan from the confirmed decisions. Nothing is deployed and no
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

Branches: production, preview, development. Database users with least
privilege: migrations (schema changes), dashboard (read/write), public site
(insert sign-ups, read published content only), backups (read-only).
Migrations run from CI, never from a running Worker. Database users are
`hantex_admin_app`, `hantex_public_app`, `hantex_build` and `hantex_backup`,
created and granted by `pnpm --filter @hantex/db roles` (passwords from
environment variables, never stored in the repository).

## CI/CD (GitHub Actions)

- **Every pull request:** lint, type check, unit and integration tests, build,
  Worker bundle-size check against the free plan's limit, dependency scan.
  Runs on Node.js 26 and pnpm 12 (D-023).
- **Merge to main:** deploy to preview; production deploy requires manual
  approval.
- **Publish in the dashboard:** triggers a rebuild and deploy of **that site
  only** (D-006, D-028), using a narrowly scoped token.
- **Nightly:** encrypted database export to R2 (D-010) and health checks
  with email alerts (D-011).
- **3D Studio processing (D-030, confirmed):** photo reconstruction,
  optimisation, validation and poster rendering run on a *processing runner*
  on the owner's own Mac or PC. It never runs in this public repository,
  whose logs and artifacts anyone can read. No paid AI providers are called.

## Secrets (names only — values are never written here)

| Name | Where |
|------|-------|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions (scoped token) |
| `DATABASE_URL` (owner role, migrations only) | GitHub Actions |
| `HANTEX_ADMIN_APP_PASSWORD`, `HANTEX_PUBLIC_APP_PASSWORD`, `HANTEX_BUILD_PASSWORD`, `HANTEX_BACKUP_PASSWORD` | GitHub Actions (role setup); each user's connection string in Hyperdrive or CI |
| `BACKUP_ENCRYPTION_KEY` | GitHub Actions; owner keeps an offline copy |
| `BETTER_AUTH_SECRET` | Worker secret (`hantex-admin`) |
| `RESEND_API_KEY` | Worker secret |
| `TURNSTILE_SECRET_KEY` | Worker secret |
| `PUBLISH_TRIGGER_TOKEN` | Worker secret (can only start the site build) |
| `R2_STUDIO_ACCESS_KEY_ID`, `R2_STUDIO_SECRET_ACCESS_KEY` | Worker secret (signed upload and download links, limited to the `studio` bucket) and processing runner |
| `STUDIO_DISPATCH_TOKEN` | Worker secret (can only start processing jobs in the private runner repository) |
| `STUDIO_CALLBACK_SECRET` | Worker secret and processing runner (signs job results) |
| One API key per approved 3D provider, for example `MESHY_API_KEY` | Processing runner only, added only after the owner approves that provider (D-005) |

## Rollback

- Code: redeploy the previous Worker version (Cloudflare keeps versions).
- Database: migrations are backward-compatible (expand, then contract);
  restore from Neon point-in-time or the nightly backup if needed.

## Owner actions needed before the first deployment

I'll guide each step when we reach it:

- create a free Neon account and project;
- create a free Resend account;
- enable Cloudflare Zero Trust (free) for Access;
- create a scoped Cloudflare API token;
- add secrets to GitHub;
- approve each DNS change;
- receive the first-Owner setup link. It is created after the first
  deployment with `pnpm --filter @hantex/db setup-owner <your email>`. It
  works once, expires after 24 hours, and stops working as soon as an Owner
  exists. It is sent to you privately and never stored.

**For the 3D Studio (Phase 3, D-030):** create a private repository for the
processing runner, or set up the runner on your own computer. Approve any
paid provider before its key is added.
