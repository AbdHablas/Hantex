# Deployment

**Status:** plan from the confirmed decisions. Nothing is deployed and no
Cloudflare, DNS or database change is made without the owner's explicit
approval.

## Environments

| Environment | Purpose | Public? |
|-------------|---------|---------|
| Local | Development and tests | No |
| Preview | Testing changes before production | No — behind Cloudflare Access, `noindex` |
| Production | www.hantexultra.com and the dashboard | Public site only |

Each environment has its own Neon database branch, R2 buckets and secrets;
production data is never used in development or tests.

## Cloudflare resources (Free plan, D-008)

| Resource | Use |
|----------|-----|
| Worker `hantex-web` | Public site: static pages (Astro) and form endpoints |
| Worker `hantex-admin` | Dashboard (React app) and its API (Hono) on `admin.hantexultra.com` |
| Hyperdrive | Database connections: read-only for the public site, uncached for the dashboard |
| R2 buckets | Media and documents; private bucket for encrypted backups |
| Turnstile | Spam protection on sign-up and sign-in |
| Cloudflare Access (Zero Trust free) | Second lock in front of the dashboard and previews |
| Workers Logs, Cron Triggers | Monitoring, health checks, scheduled publishing |

## DNS (each change proposed first, applied only after approval)

- `www.hantexultra.com` → `hantex-web` (custom domain).
- `hantexultra.com` → redirect to `https://www.hantexultra.com`.
- `admin.hantexultra.com` → `hantex-admin`, behind Cloudflare Access.
- Email sending records for Resend (SPF, DKIM, DMARC).

## Database (Neon, D-003 and D-010)

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
- **Merge to main:** deploy to preview; production deploy requires manual
  approval.
- **Publish in the dashboard:** triggers a rebuild and deploy of the public
  site (D-006) using a narrowly scoped token.
- **Nightly:** encrypted database export to R2 (D-010) and health checks
  with email alerts (D-011).

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

## Rollback

- Code: redeploy the previous Worker version (Cloudflare keeps versions).
- Database: migrations are backward-compatible (expand, then contract);
  restore from Neon point-in-time or the nightly backup if needed.

## Owner actions needed before the first deployment

Guided step by step when we reach them: create a free Neon account and
project; create a free Resend account; enable Cloudflare Zero Trust (free)
for Access; create a scoped Cloudflare API token; add secrets to GitHub;
approve each DNS change.
