# Hantex Ultra platform: the whole project in one document

This is a single overview of the project as of 2026-10-24: what it is, how it is
built, what has been done, what is left and how to work on it. Each section
links to the detailed document it summarises. Where this page and a detailed
document disagree, the detailed document and [`DECISIONS.md`](DECISIONS.md)
are the source of truth.

## Contents

1. [What the project is](#1-what-the-project-is)
2. [Ground rules](#2-ground-rules)
3. [Architecture](#3-architecture)
4. [Technology](#4-technology)
5. [Repository layout](#5-repository-layout)
6. [The dashboard](#6-the-dashboard)
7. [The public websites](#7-the-public-websites)
8. [Roles and permissions](#8-roles-and-permissions)
9. [Security](#9-security)
10. [Data and storage](#10-data-and-storage)
11. [Testing and CI](#11-testing-and-ci)
12. [Deployment](#12-deployment)
13. [Progress by phase](#13-progress-by-phase)
14. [Decisions](#14-decisions)
15. [Open items](#15-open-items)
16. [Working on the code](#16-working-on-the-code)
17. [Document index](#17-document-index)

---

## 1. What the project is

A website platform for **Hantex Ultra** (www.hantexultra.com), a brand of
electrical switches, sockets, lighting, lamps and accessories.

- **One dashboard manages many websites** (D-024). Hantex Ultra is the first.
  The owner can create more, each with its own domains, languages, branding,
  theme, pages, products, sign-ups and settings.
- **The catalogue is general** (D-045). Any kind of product can be listed on
  any website. Switches and sockets are Hantex Ultra's first categories; they
  are data, not something built into the code.
- **The public site stays in Coming Soon mode** until the owner approves the
  full launch.
- **Nothing is deployed yet.** The first deployment is prepared and waits on
  the owner (see [section 12](#12-deployment)).

## 2. Ground rules

These come from the owner and apply to all work on the project.

**Security**
- No permanent hard-coded administrator account. The first Owner is created
  with a single-use setup link.
- No credentials in source code, documentation or example files. Secrets never
  go into source control or chat.
- Private environment variables are never exposed to frontend code.
- Security controls are never disabled to make a feature work. Editable
  settings can't bypass validation or security policies.

**Production**
- DNS changes, production database changes and potentially disruptive
  deployments need the owner's explicit approval.
- Ask before destructive operations.
- The unfinished dashboard is not deployed publicly just because the Coming
  Soon page is ready.

**Honesty**
- No invented company details, product specifications, certifications, test
  results, history or launch dates.
- Tests, deployments and integrations are reported as passing only when that
  was actually run and verified.

**Way of working**
- Step by step, one question at a time. Every decision is recorded in
  [`DECISIONS.md`](DECISIONS.md).
- Inspect existing files before changing them. Never overwrite work without
  understanding its purpose.
- Use the latest stable versions of every platform and library (D-023).
- Use free tiers first; any paid service needs the owner's approval (D-005).

## 3. Architecture

A TypeScript modular monolith on Cloudflare, in one repository.
Details: [`architecture.md`](architecture.md), [`multi-site.md`](multi-site.md).

```
Public websites (one Cloudflare Worker each, D-028)
  www.hantexultra.com ── site-hantex-ultra   static pages + form endpoints
  <another domain>    ── site-<key>          static pages + form endpoints

admin.hantexultra.com ── Cloudflare Access (second lock)
  └─ Dashboard Worker "hantex-admin"
       ├─ React + Vite app     website switcher, platform pages
       └─ Hono API ── Better Auth (passkeys)
            │  permission checked per website on every request
            ├──► Hyperdrive ──► PostgreSQL 18   one database, data scoped by website
            ├──► R2 "hantex-media" (private)   media library
            └──► GitHub Actions: build and deploy one website on publish
```

**How a public page gets to visitors (D-006)**
- Pages are generated at build time and served as static files. No code runs
  and no database is read when a visitor views a page.
- Publishing in the dashboard rebuilds and redeploys only the website
  concerned. Changes appear after a few minutes.
- Forms (launch sign-up, later enquiries) post to small endpoints on the
  website's Worker. Those use a database user that can only insert, and only
  for its own website.
- Draft previews are signed by the dashboard and can only be shown inside the
  dashboard.

## 4. Technology

All versions are pinned exactly, at the latest stable release (D-023).
Details: [`development.md`](development.md), [`tooling.md`](tooling.md).

| Layer | Choice |
|-------|--------|
| Runtime and tooling | Node.js 26, pnpm 12 workspace, TypeScript, ESLint, Prettier |
| Dashboard API | Hono on Cloudflare Workers (Free plan) |
| Dashboard app | React 19 + Vite, Tailwind CSS, Radix primitives (shadcn/ui style), Lucide icons, TanStack Query |
| Builder editing | dnd-kit (drag and drop, keyboard accessible), Tiptap (limited rich text stored as JSON) (D-036) |
| Public websites | Astro site engine, one build per website, Tailwind CSS, zero-JavaScript components with small islands only where needed |
| Sign-in | Better Auth, passwordless: passkeys, emailed one-time codes and recovery codes; invitation only (D-007) |
| Database | PostgreSQL 18 through Cloudflare Hyperdrive, Drizzle ORM with versioned migrations. Hosting is planned on Neon; see [open items](#15-open-items) |
| Validation | Zod schemas shared by the API, dashboard and site engine |
| Files | Cloudflare R2 |
| Email | Resend, free tier (D-009) |
| Bot protection | Cloudflare Turnstile |
| Visitor statistics | Cloudflare Web Analytics, cookieless (D-042) |
| Tests | Vitest (with the Cloudflare Workers plugin), Playwright, axe accessibility checks |
| Typefaces | Poppins (Latin) and Cairo (Arabic), self-hosted (D-013, D-031) |

## 5. Repository layout

```
apps/api            Dashboard Worker (Hono): API for every website and the platform;
                    also serves the built dashboard app
apps/admin          Dashboard (React + Vite)
apps/web            Site engine (Astro): builds any one website from its published content
packages/db         Drizzle schema, SQL migrations, least-privilege database users and grants
packages/shared     Permissions, roles, validation schemas, shared helpers
packages/sections   Website builder section registry: settings schemas and defaults
packages/theme      Design tokens, themes, contrast checks, theme → CSS
brand/              Hantex Ultra logo files (fixed, and adaptive light/dark)
scripts/            Local database and setup scripts
docs/               Project documentation
.github/workflows   ci, deploy, publish, backup, health
```

Planned later: `apps/studio-runner` and `packages/studio` for the 3D Product
Studio, and `packages/ui` for shared public components.

## 6. The dashboard

Navigation is described in [`dashboard-navigation.md`](dashboard-navigation.md).
It is in Arabic (right to left) and English, with light, dark or device theme,
and works from phone to desktop. It includes a collapsible sidebar and a
Ctrl/Cmd+K command palette.

**Per website** (chosen in the website switcher)
- **Overview:** daily sign-ups and the email/WhatsApp split.
- **Content & design**
  - *Coming Soon page:* editor with publish, preview and version history.
  - *Pages:* create, rename, duplicate, reorder, hide, publish, delete. Each
    page has its slug, SEO and sharing fields, a home page and a parent page.
    A privacy-policy draft template is available (D-041).
  - *Section editor:* add, remove, reorder, duplicate and hide sections per
    device. Live preview at phone, tablet and desktop widths.
  - *Sections available:* hero, rich text, features, call to action, FAQ,
    statistics, contact, newsletter sign-up, cards/category list and divider,
    plus saved sections.
  - *Menus, header and footer:* links to pages and addresses, with dropdowns.
  - *Media:* upload, describe and delete images (step 2 of the media library;
    see [section 10](#10-data-and-storage)).
  - *Appearance:* colours for light and dark, logo colours (Owner only), fonts,
    sizes, rounding, shadows and animation. Live contrast checks, preview,
    publish, rollback and saved presets.
  - *Typography & fonts:* heading and body fonts for Arabic and Latin, twelve
    text styles and four presets (D-032).
- **Audience**
  - *Sign-ups:* search, export and delete.
  - *Launch announcement email:* written in both languages and sent in
    batches within a daily limit, with one-click unsubscribe (D-040).
  - *WhatsApp export:* numbers exported for manual sending.
- **Website settings:** SEO, contact details, social links, the sign-up
  privacy note and the Web Analytics token.
- **Publish changes:** one action per website. It validates, saves a
  version, adds redirects for changed slugs and rebuilds that website only
  (D-037).

**Administration (all websites)**
- *Websites:* guided creation (always starting in Coming Soon), duplication,
  domains, languages, mode and archiving.
- *Staff:* invitations per website or for all websites.
- *Roles:* the permission matrix editor.
- *Audit log:* the full log across websites.

**Account:** passkeys and recovery codes.

## 7. The public websites

The site engine (`apps/web`) builds one website from its published content.

- **Modes:** Coming Soon, live, maintenance. Coming Soon stays a mode, not a
  page.
- **Languages:** Arabic at `/` (right to left) and English at `/en/`. The
  languages are set per website.
- **Theme:** the website's own theme, logo and only the fonts it uses; light
  and dark with a visitor toggle.
- **Live websites:** pages, menus and sections from the builder, with
  trailing-slash addresses, a sitemap and redirects for changed slugs.
- **Coming Soon page:** animated hero, countdown, product categories, FAQ and
  a launch sign-up form (email or WhatsApp, with consent).
- **SEO:** title and description from settings, canonical address, `hreflang`
  and Open Graph sharing image.
- **Pages:** `robots.txt` and a 404 page.
- **Unsubscribe page:** for the announcement emails.
- **Strict security policy:** no inline scripts or styles.

## 8. Roles and permissions

There are six standard roles, and the matrix can be edited in the dashboard
(D-019). Roles are assigned per website or for all websites (D-025). Owners
always cover all websites. Full matrix:
[`roles-and-permissions.md`](roles-and-permissions.md).

| Role | In short |
|------|----------|
| Owner | Everything, including staff, roles, websites and going live. At least one must always exist. |
| Administrator | Runs websites day to day. Can't manage Owners or roles, or take a site live. |
| Content Manager | Edits and publishes content. |
| Sales & Enquiries | Sign-ups and enquiries. Doesn't edit the website. |
| Editor | Drafts and image uploads; someone else publishes. |
| Viewer | Read only. Never sees customer personal data. |

How permissions are enforced:
- Every permission is checked on the server, on every request.
- Nobody can change their own role.
- The API tests call every website endpoint as every standard role on two
  websites.

## 9. Security

Details: [`security.md`](security.md).

**Access**
- The dashboard sits behind Cloudflare Access, plus passkey sign-in.
- There's no public sign-up: staff join by invitation.
- Requests must come from the same origin, and every action writes an audit
  entry.

**Database**
- There are separate least-privilege database users for the dashboard, the
  public forms (insert only), the site build (read published content only)
  and backups.

**Forms**
- Turnstile protects them and fails closed if it can't verify.
- Other protections: a honeypot field, rate limits by hashed address, and the
  same answer for repeat sign-ups.

**Content and uploads**
- The builder is structured, with validated section settings. It allows no
  free HTML, CSS or scripts (D-035).
- Images are re-encoded in the browser, which strips camera and location
  data. The API then checks every file again: its type, sizes and the
  website's storage quota (D-044).
- Media files stay private and are served only to signed-in staff.

**Secrets**
- Secrets live in the Cloudflare and GitHub secret stores. Documents list
  names only, never values.

**Supply chain**
- CI audits dependencies.
- Known advisories in transitive packages are patched with pnpm overrides,
  recorded in `pnpm-workspace.yaml`.

## 10. Data and storage

**Database:** PostgreSQL 18. Every row of website data carries its website.
The main data:
- websites and their domains;
- role assignments;
- documents with drafts and versions (Coming Soon content, settings, theme,
  pages, menus, saved sections);
- publish jobs;
- sign-ups and their rate limits;
- announcements and deliveries;
- media assets;
- the audit log.

**Media library** (Phase 3b)
- **Step 1 (done):** private R2 bucket `hantex-media`, with keys of the form
  `private|public/<site>/<asset>/<width>.webp`.
- **Step 2 (done):** the Media page.
  - Each image is stored at up to four widths (480, 960, 1600 and 2400 px),
    never larger than the original.
  - The API checks the files and enforces a per-website quota
    (`MEDIA_SITE_QUOTA_MB`, 1 GB by default).
  - Uploading is open to Owner, Administrator, Content Manager and Editor;
    deleting to Owner and Administrator only.
- **Step 3 (next):**
  - copy images to public storage when content using them is published, and
    serve them from each website's own `/media/` address;
  - signed links in previews;
  - block deleting images that are in use;
  - image, image-and-text and gallery sections.

**Backups (D-010):** the database host's built-in restore, plus nightly
encrypted exports to R2 (30 daily and 12 monthly copies). The workflow is
ready but inactive until configured.

## 11. Testing and CI

All tests run locally against PostgreSQL 18 and in GitHub Actions on every
push.

| Suite | What it covers | Last local run (2026-10-24) |
|-------|----------------|------------------------------|
| Unit and integration (Vitest) | Database users and grants, every API endpoint × every role × two websites, schemas, themes, sections, dashboard logic | 661 passed |
| Dashboard browser tests (Playwright) | First-Owner setup with a virtual passkey, editors, publishing, builder workflow, second website, announcement, media upload, sign out and in, accessibility (axe), phone widths | 3 passed |
| Website browser tests (Playwright) | Coming Soon and live websites in Arabic and English, light and dark, phone to desktop, accessibility, page weight | 34 passed (last run before the media work; the site engine hasn't changed since) |

CI jobs:
- lint, type-check, unit tests and build;
- dashboard end-to-end tests;
- dependency audit (fails on high-severity advisories);
- website end-to-end tests;
- Worker size check.

The check named "Workers Builds: hantex" comes from Cloudflare's own
repository connection, not from this repository's workflows. It fails because
the repository root has no Worker configuration. See
[open items](#15-open-items).

## 12. Deployment

Runbook: [`deployment.md`](deployment.md).

- `deploy.yml` deploys the database, dashboard or a website. It waits for the
  owner's approval in a GitHub environment.
- `publish.yml` rebuilds one website when content is published.
- `backup.yml` and `health.yml` are ready but inactive.

**First deployment, in order** (each step done by or with the owner):

1. Database host: create the PostgreSQL 18 database (see open items).
2. Generate passwords and secrets on the owner's own computer. They never go
   into chat or the repository.
3. GitHub environments, with the secrets stored there.
4. Deploy → `database`: migrations, roles and grants.
5. Cloudflare Hyperdrive configurations.
6. Turnstile widget.
7. Resend: verify the sending domain (DNS changes need approval).
8. Cloudflare Access for the dashboard.
9. Deploy → `dashboard`, and connect its domain.
10. First Owner: single-use `setup-owner` link.
11. Deploy → `site` for `hantex-ultra`, in Coming Soon mode, and connect its
    domain.
12. A GitHub token for publishing.

Configuration names (values are never written down): `UNSUBSCRIBE_SECRET`,
`ANNOUNCEMENT_DAILY_LIMIT`, `MEDIA_SITE_QUOTA_MB` and the others listed in
`deployment.md`. The R2 bucket `hantex-media` is bound as `MEDIA`.

## 13. Progress by phase

Full checklist: [`implementation-plan.md`](implementation-plan.md).

| Phase | Status |
|-------|--------|
| 1. Discovery and architecture | Complete |
| 2. Coming Soon page and multi-site dashboard foundation | Built and approved by the owner (2026-10-21); first deployment pending |
| Frontend quality and typography | Cairo and the typography system done; accessibility and phone checks automated; custom font uploads and shared components to come |
| 3a. Website builder core | Complete, including acceptance: a second website created, customised and published without code, the first website unchanged (verified in the browser tests) |
| 3b. Media | Steps 1–2 done; step 3, SVG sanitiser, font and logo uploads, and media sections to do |
| 3c. Catalogue and studio | Announcement email (D-040) and privacy draft (D-041) done; Web Analytics partly done (D-042); general catalogue (D-045), enquiries, 3D Studio stage 1 and scheduled publishing to do |
| 4. Complete public websites | Not started: product showcase template, search, 3D on product pages, structured data |
| 5. Testing and hardening | Not started: penetration test, restore test, performance budgets |
| 6. Production launch | Not started: each DNS change and each website's launch approved by the owner |

## 14. Decisions

Forty-five decisions are recorded in [`DECISIONS.md`](DECISIONS.md). All are
confirmed except D-015, which D-031 superseded. The ones that shape the
project most:

| ID | Decision |
|----|----------|
| D-005 | Lowest cost: free tiers first; paid services need approval |
| D-006 | Static pages rebuilt on publish, plus small form endpoints |
| D-007 | Passwordless staff sign-in with passkeys; Workers Free |
| D-014 | Arabic (default, right to left) and English |
| D-019 / D-025 | Six standard roles, editable matrix, assigned per website or for all |
| D-021 / D-022 / D-027 | Light and dark everywhere; per-website themes edited in the dashboard |
| D-023 | Latest stable versions, pinned |
| D-024 / D-028 | Many websites from one dashboard; one Worker per website |
| D-029 / D-030 | 3D Product Studio with free photogrammetry, no paid AI, approval before publishing |
| D-035 – D-039 | Structured website builder: sections, drafts, one publish per website, copied templates |
| D-040 | Launch announcement email with unsubscribe; WhatsApp export |
| D-041 | Privacy policy drafted from facts, published only after review |
| D-042 | Cloudflare Web Analytics |
| D-043 | axe accessibility checks in browser tests |
| D-044 | Images processed in the browser before upload; server re-checks |
| D-045 | General catalogue for any kind of product |

## 15. Open items

These need the owner:
- **Database host:** the owner is still choosing between Neon and Cloudflare
  D1. The code is written for PostgreSQL 18 (via Hyperdrive). Moving to D1
  (SQLite) would mean rewriting the database layer, migrations and the
  least-privilege database users. Deployment is paused until this is chosen.
- **Cloudflare "Workers Builds" connection:** it builds on every push and
  fails, because deployment is meant to run through `deploy.yml` with
  approval. Disconnecting it, or leaving it for now, is the owner's choice.
- **Resend:** confirm its current limits and header support when setting it
  up. resend.com can't be reached from the build environment.
- **Visitor figures on the overview:** need a read-only Cloudflare API token
  from the owner.
- **Privacy policy:** company details, database region and retention periods
  to be filled in and reviewed.

Next development work:
- media step 3;
- the general product catalogue (3c).

## 16. Working on the code

```bash
pnpm install
pnpm db:local start        # local PostgreSQL 18 on 127.0.0.1:54329
pnpm test                  # all unit and integration tests
pnpm lint && pnpm typecheck && pnpm format:check
pnpm build
```

- Browser tests: `pnpm --filter @hantex/admin exec playwright test` and the
  same for `@hantex/web`. They need `HANTEX_TEST_DATABASE_URL` and a build.
- Database changes: edit `packages/db/src/schema.ts`, generate a migration,
  review the SQL, and add every new table to `packages/db/sql/grants.sql`.
  Nothing is granted by default.
- Interface text lives in `apps/admin/src/lib/messages.ts`, in Arabic and
  English. A test checks that both languages have the same keys.
- Full guide: [`development.md`](development.md).

## 17. Document index

| Document | Contents |
|----------|----------|
| [`DECISIONS.md`](DECISIONS.md) | Decision log, D-001 to D-045 |
| [`implementation-plan.md`](implementation-plan.md) | Phases and checklist |
| [`architecture.md`](architecture.md) | Architecture and stack |
| [`multi-site.md`](multi-site.md) | One dashboard for many websites |
| [`website-builder.md`](website-builder.md) | Pages, sections, menus, publishing |
| [`product-catalogue.md`](product-catalogue.md) | General catalogue structure |
| [`3d-product-studio.md`](3d-product-studio.md) | 3D Product Studio: options, costs, limits |
| [`theming.md`](theming.md) | Light/dark, themes, typography, design system |
| [`dashboard-navigation.md`](dashboard-navigation.md) | Dashboard menus |
| [`roles-and-permissions.md`](roles-and-permissions.md) | Roles and the full matrix |
| [`security.md`](security.md) | Security controls and risks |
| [`deployment.md`](deployment.md) | Environments, CI/CD, secrets, rollback, first deployment |
| [`development.md`](development.md) | Local setup and checks |
| [`tooling.md`](tooling.md) | Development tooling |
| [`brand-guidelines.md`](brand-guidelines.md) | Brand, colours, logo |
| [`phase-2-report.md`](phase-2-report.md) | Phase 2 report |
| [`previous-coming-soon-review.md`](previous-coming-soon-review.md) | Review of the earlier Coming Soon project |
