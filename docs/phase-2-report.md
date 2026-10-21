# Phase 2 report: Coming Soon page and multi-site dashboard foundation

**Date:** 2026-10-21 · **Status:** built and tested; **approved by the owner on 2026-10-21**; first deployment started, **not deployed yet**
([`deployment.md`](deployment.md#first-deployment-step-by-step)).

## What was built

| Area | What exists now | Where |
|------|-----------------|-------|
| Multi-site platform (D-024, D-025) | Sites and domains; every record belongs to a site; staff roles per site or for all sites; database rules that block per-site Owners and mixed roles | `packages/db`, `packages/shared` |
| Dashboard API | Passkey sign-in, invitations, account recovery, staff and roles, sites, content per site, sign-ups, publishing, previews, audit log. Every request is checked against the person's role on that site. | `apps/api` |
| Dashboard app | Arabic (default, right-to-left) and English, light and dark. Site switcher. Editors for the Coming Soon page, site settings and appearance, with save, preview, publish and restore. Sign-ups, staff, roles, websites, audit log, account. | `apps/admin` |
| Public site engine | Builds any one site from its published content. Coming Soon and maintenance pages, Arabic at `/` and English at `/en/`, light/dark, the site's theme, logo and fonts. Launch sign-up form. Signed draft previews. | `apps/web` |
| First Owner | A single-use setup link, valid 24 hours, closed once an Owner exists; no built-in administrator account | `packages/db` (`setup-owner`) |
| Deployment | Hand-run production deployment that waits for the owner's approval; site publishing started by the dashboard; Worker size check | `.github/workflows`, [`deployment.md`](deployment.md) |
| Toolchain (D-023) | Node.js 26, pnpm 12, PostgreSQL 18; latest stable libraries, with recorded exceptions | [`development.md`](development.md) |

## How it was verified

Every result below was run and checked, locally and in GitHub Actions, on
the current code.

| Check | Result |
|-------|--------|
| Theme package tests (tokens, contrast, CSS) | 23 passed |
| Shared package tests (permissions, roles, sites, assignments, content) | 55 passed |
| Database tests (constraints, triggers, each database user's grants), PostgreSQL 18 | 29 passed |
| Dashboard API tests: every site endpoint × every standard role × two sites, isolation between sites, staff escalation rules, invitations, recovery | 346 passed |
| Dashboard app tests (Arabic and English texts complete and matching) | 3 passed |
| Public site tests (sign-up rules, preview signatures, sign-up database access as the public user) | 15 passed |
| Dashboard in a real browser with a virtual passkey device: setup link → passkey → edit and publish → preview → site settings → appearance checks → sign out → sign in | 3 passed |
| Public site in a real browser, built from a test database: Arabic and English, right-to-left, light/dark, published content, security headers, sign-up refusals, previews | 6 passed |
| Lint, format, type checks, builds, dependency audit (high and above) | Pass |
| Worker sizes | Dashboard 3.7 MiB, site 0.9 MiB: under 6% of the Free plan limit |

## Security in place

- Passkeys only, invitation only, recovery with an emailed code **and** a
  recovery code; disabled staff are signed out at once.
- Every request is checked on the server against the person's role on that
  site. A site someone can't open looks like it doesn't exist.
- Least-privilege database users: the public sites can add sign-ups but not
  read them; the build reads published content only; the audit log can't be
  edited.
- Strict Content-Security-Policy on the dashboard and the sites (no inline
  scripts or styles); no `workers.dev` or preview addresses for the Workers.
- Sign-ups: consent, Turnstile (fails closed), honeypot, rate limit by a hash
  of the visitor's address, the same answer for repeats.
- Releases less than a day old are not installed (supply-chain safety).

## Not done yet, and known limits

- **Not deployed.** No Cloudflare, DNS or database change has been made.
- **Not verified end to end:** a sign-up that passes Turnstile and is stored.
  This environment can't reach Cloudflare, so the browser test uses
  Turnstile's always-failing key and the database side is tested separately.
  It will be checked on the staging deployment.
- **Privacy note** for the sign-up form: editable per site in Website
  settings → SEO & contact; hidden until the owner writes it.
- **Site-wide rate limit** (all visitors together): a Cloudflare rule, set up
  with the deployment.
- **Emails** are sent from the platform's domain until each site's domain is
  verified with Resend.
- **Nightly backups** and **health checks** are written (`backup.yml`,
  `health.yml`) but stay inactive until their configuration is added with the
  deployment (D-010, D-011); a restore rehearsal follows the first backup.
- **Preview environment**: set up with the deployment.
- The dashboard's main JavaScript file is 744 kB (227 kB compressed); the
  overview charts load separately (382 kB, 110 kB compressed) only when that
  page opens.

## Cost

US$0. Everything fits the free plans: Cloudflare Workers Free, Neon free,
Resend free, Turnstile, Cloudflare Access free, GitHub Actions on a public
repository.

## Owner decisions

1. **This phase: approved on 2026-10-21.** Phase 3 can start: media
   library, product catalogue (switches and sockets first) and the 3D Studio
   foundation.
2. **First deployment: approved to start on 2026-10-21**, step by step as in
   [`deployment.md`](deployment.md#first-deployment-step-by-step). Each step,
   including every DNS change, still needs the owner's go-ahead. The public
   site stays in Coming Soon mode.
3. **Still open:** the sign-up privacy note's wording (typed in the
   dashboard: Website settings → SEO & contact → Privacy note).

## Added after the report

- Dashboard interface rebuilt on Radix components, with a command palette,
  charts on the overview and in-app confirmations.
- Navigation reorganised into sections
  ([`dashboard-navigation.md`](dashboard-navigation.md)).
- Arabic typeface changed to Cairo (D-031); Typography & fonts section per
  site with text styles and presets (D-032).
- Public site: richer Coming Soon page with product categories and FAQ
  edited in the dashboard.
