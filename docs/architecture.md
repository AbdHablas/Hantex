# Architecture

This document describes what has been confirmed in
[`DECISIONS.md`](DECISIONS.md).

## Overview

A TypeScript modular monolith on Cloudflare, in one repository. One shared
dashboard manages several public websites (D-024).

```
Public websites (one Cloudflare Worker each, D-028)
  www.hantexultra.com ── site-hantex-ultra   static pages + form endpoints
  <another domain>    ── site-<key>          static pages + form endpoints
  media.<site domain> ── R2 "media" bucket   approved photos, 3D models, documents

admin.hantexultra.com ── Cloudflare Access (second lock)
  └─ Dashboard Worker "hantex-admin"
       ├─ React + Vite app     site switcher, platform pages
       └─ Hono API ── Better Auth (passkeys)
            │  permission checked per site on every request
            ├──► Hyperdrive ──► Neon PostgreSQL 18   one database, data scoped by site
            ├──► R2 "studio" bucket (private) ◄──► processing runner (private, D-030)
            │                                        └──► optional 3D providers
            └──► GitHub Actions: build and deploy one site on publish
                  (site engine apps/web)
```

## Public site rendering (confirmed, D-006)

- Pages are generated at build time and served as static files. No code
  runs and no database is queried on a page view.
- Publishing in the dashboard rebuilds and deploys **only the site
  concerned**. Changes appear after a few minutes. Scheduled publishing
  triggers the same rebuild.
- Forms (contact, enquiries, launch sign-up) post to small server endpoints
  protected by Turnstile and rate limits. They use a database user that can
  only insert submissions, for the site set in the Worker's configuration.
- Draft previews are rendered on the protected dashboard side, never on a
  public site.
- Any single page can later be switched to server rendering if needed.

## Stack (confirmed)

| Layer | Choice |
|-------|--------|
| Public websites | Astro site engine (one code base, one build per site), Tailwind CSS, shared design tokens, custom components; Arabic (default, RTL) and English for Hantex Ultra, languages set per site |
| Typefaces | Poppins (Latin) and Readex Pro (Arabic) for Hantex Ultra, self-hosted; other sites choose from the font library |
| Admin dashboard | React + Vite + TypeScript, Tailwind CSS, shadcn/ui, Lucide |
| API | Hono on Cloudflare Workers |
| Authentication | Better Auth, passwordless: passkeys (`@better-auth/passkey`), with emailed one-time codes plus recovery codes for new devices and recovery; invite-only |
| Authorisation | Six standard roles in a dashboard-editable matrix; permissions enforced by Hono middleware on every request, per site, with an "all sites" option (D-025) |
| Audit log | Own table; every entry records its site |
| Database | PostgreSQL 18 on Neon, via Cloudflare Hyperdrive, standard Postgres driver |
| Data access | Drizzle ORM with versioned migrations |
| Validation | Zod schemas shared by API and dashboard |
| Files | Cloudflare R2: public `media` bucket for approved files, private `studio` and `backups` buckets |
| Email sending | Resend (free tier) |
| Backups | Neon built-in restore, plus nightly encrypted exports to a private R2 bucket (30 daily, 12 monthly) |
| Monitoring | Cloudflare Workers Logs, scheduled health and backup checks with email alerts |
| Testing | Vitest 5 (with `@cloudflare/vitest-plugin` for Workers), Playwright, axe accessibility checks, Lighthouse |
| Versions | Latest stable release of every platform and library, pinned exactly, with documented exceptions (D-023; see [`development.md`](development.md)) |

## Multi-website platform (D-024 confirmed)

Every public website is a **site**. Each site has its own domains,
languages, mode (Coming Soon, live or maintenance), theme, content, product
catalogue, sign-ups and enquiries. Shared across all sites:

- staff accounts and role definitions;
- the font library and design-system components;
- the publishing pipeline;
- the 3D Studio;
- email, monitoring and backups.

New sites are created in the dashboard by the Owner and start in Coming Soon
mode. Details: [`multi-site.md`](multi-site.md).

## Product catalogue (D-026 confirmed)

Each site has its own catalogue:

- categories (an ordered tree with *main* categories);
- series (design lines);
- products, and variants usually by finish;
- reusable finishes;
- typed attributes defined in the dashboard;
- documents, photos and 3D models.

For Hantex Ultra, switches and sockets lead the structure, navigation and
presentation, followed by lighting, lamps and accessories. Product and
series pages are built from blocks: 3D hero, scroll-linked features, finish
selector, specifications, downloads. Details:
[`product-catalogue.md`](product-catalogue.md).

## Design system and theming (D-021, D-022, D-027 confirmed)

- **Design tokens with light and dark values** drive every public page,
  component and SVG.
- **Each site has its own theme**, edited in the dashboard's Appearance
  section, starting from a preset. Publishing a theme rebuilds that site.
- **The font library and SVG logo uploads** (sanitised, with colours mapped
  to theme tokens) let new brands be added without code.

Details: [`theming.md`](theming.md).

## AI 3D Product Studio (D-029, D-030 confirmed)

A reusable dashboard module that turns product captures into optimised,
interactive 3D models with poster-image fallbacks.

- **Inputs:** photos, a full photo capture, or CAD files.
- **Providers:** CAD conversion, photogrammetry, AI generation and 3D
  artists plug in behind one provider interface.
- **Quality control:** automated checks and human review gate every model.
- **Honest labels:** results are labelled as measured (CAD or
  photogrammetry), AI-estimated, or AI imagery that is not a 3D model.
- **Approval before publishing:** nothing is published without approval.

Heavy processing runs on a private processing runner, never in the
dashboard Worker. Details, costs, storage and limitations:
[`3d-product-studio.md`](3d-product-studio.md).

## Security boundaries (confirmed)

- The dashboard and its API share one origin on their own subdomain, behind
  Cloudflare Access.
- Site Workers can only insert sign-ups and enquiries for their own site.
  The build reads published content only, and the dashboard uses an uncached
  connection.
- No public sign-up: staff accounts are created by invitation.
- Secrets live in Cloudflare and CI secret stores, never in the repository.
- Unreleased product files stay in private storage until approved and
  published.

## Domain (confirmed, D-008)

- hantexultra.com is active on the owner's Cloudflare account (Free plan).
- Canonical address: `https://www.hantexultra.com`; the bare domain redirects
  to it.
- Other sites' domains must be added to the same Cloudflare account. Each
  DNS change needs the owner's approval.

## Cost

Lowest cost (D-005): free tiers first, and paid services only with the
owner's approval.

- The Workers Free plan is used (D-007). The dashboard Worker's bundle size
  is checked against the free plan's limit in CI.
- No paid 3D providers: the owner chose free methods only (D-030). Any
  provider added later is pay-per-use behind an owner-set budget.

## Planned repository layout

```
apps/web            Site engine (Astro): builds any one site from its published data
apps/admin          Dashboard (React + Vite)
apps/api            Dashboard Worker (Hono): API for every site and the platform
apps/studio-runner  3D processing jobs (Node.js), run privately (D-030)
packages/theme      Design tokens, themes, contrast checks, theme → CSS
packages/ui         Public-site design-system components, tokens only
packages/shared     Permissions, roles, validation schemas (content, catalogue)
packages/studio     3D Studio: provider interface, job states, quality rules
packages/db         Drizzle schema, migrations, database roles
brand/              Hantex Ultra logo files
docs/               Project documentation
```

## Related documents

[`multi-site.md`](multi-site.md) ·
[`product-catalogue.md`](product-catalogue.md) ·
[`3d-product-studio.md`](3d-product-studio.md) ·
[`theming.md`](theming.md) ·
[`roles-and-permissions.md`](roles-and-permissions.md) ·
[`security.md`](security.md) · [`deployment.md`](deployment.md) ·
[`brand-guidelines.md`](brand-guidelines.md)

## Pending

No open decisions as of 2026-10-21.
