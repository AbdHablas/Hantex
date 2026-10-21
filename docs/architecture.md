# Architecture

This document describes only what has been confirmed in
[`DECISIONS.md`](DECISIONS.md). Items still open are marked *pending*.

## Overview

A TypeScript modular monolith on Cloudflare, in one repository:

```
www.hantexultra.com     Public site (Astro) ──────────────┐
                                                           │  read-only access
admin.hantexultra.com   Cloudflare Access (second lock)    │
                          └─ Dashboard Worker              │
                               ├─ React + Vite app         │
                               └─ Hono API ── Better Auth  │
                                      │                    │
                                      ▼                    ▼
                         Cloudflare Hyperdrive ──► Neon PostgreSQL
                                      │
                         Cloudflare R2 (images and documents)
```

## Public site rendering (confirmed, D-006)

- Pages are generated at build time and served as static files — no code
  runs and no database is queried on a page view.
- Publishing in the dashboard triggers an automatic rebuild and deploy; changes
  appear after a few minutes. Scheduled publishing triggers the same rebuild.
- Forms (contact, inquiries, launch sign-up) post to small server endpoints
  protected by Turnstile and rate limits, using a database user that can only
  insert submissions.
- Draft previews are rendered on the protected dashboard side, never on the
  public site.
- Any single page can later be switched to server rendering if needed.

## Stack (confirmed)

| Layer | Choice |
|-------|--------|
| Public website | Astro, Tailwind CSS, shared design tokens, custom components; Arabic (default, RTL) and English |
| Typefaces | Poppins (Latin) and Readex Pro (Arabic), self-hosted |
| Admin dashboard | React + Vite + TypeScript, Tailwind CSS, shadcn/ui, Lucide |
| API | Hono on Cloudflare Workers |
| Authentication | Better Auth — passwordless: passkeys (`@better-auth/passkey`), emailed one-time codes plus recovery codes for new devices and recovery; invite-only |
| Authorisation | Six standard roles in a dashboard-editable matrix; permissions enforced by Hono middleware on every request |
| Audit log | Own table |
| Database | PostgreSQL on Neon, via Cloudflare Hyperdrive, standard Postgres driver |
| Data access | Drizzle ORM with versioned migrations |
| Validation | Zod schemas shared by API and dashboard |
| Files | Cloudflare R2 |
| Email sending | Resend (free tier) |
| Backups | Neon built-in restore, plus nightly encrypted exports to a private R2 bucket (30 daily, 12 monthly) |
| Monitoring | Cloudflare Workers Logs, scheduled health and backup checks with email alerts |
| Testing | Vitest 5 (with `@cloudflare/vitest-plugin` for Workers), Playwright, axe accessibility checks, Lighthouse |

## Security boundaries (confirmed)

- The dashboard and its API share one origin on their own subdomain, behind
  Cloudflare Access.
- Public site database access, where needed, uses a separate read-only
  database user; dashboard access uses an uncached connection.
- No public sign-up; staff accounts are created by invitation.
- Secrets live in Cloudflare and CI secret stores, never in the repository.

## Theming (D-021 confirmed, D-022 proposed)

Design tokens with light and dark values drive every public-facing page,
component and SVG; administrators edit them in the dashboard's Appearance
section and publishing rebuilds the sites. See [`theming.md`](theming.md).

## Domain (confirmed, D-008)

- hantexultra.com is active on the owner's Cloudflare account (Free plan).
- Canonical address: `https://www.hantexultra.com`; the bare domain redirects
  to it.
- No existing website or email on the domain.

## Cost

Lowest cost (D-005): free tiers first, paid services only with owner
approval. Workers Free plan (D-007); the dashboard Worker's bundle size is
checked against the free plan's limit in CI.

## Planned repository layout

Minor implementation detail, may change during scaffolding:

```
apps/web        Astro public site
apps/admin      React + Vite dashboard
apps/api        Hono Worker (serves the dashboard and its API)
packages/db     Drizzle schema and migrations
packages/shared Zod schemas and shared types
packages/ui     Design tokens and shared components
docs/           Project documentation
```

## Related documents

[`roles-and-permissions.md`](roles-and-permissions.md) ·
[`security.md`](security.md) · [`deployment.md`](deployment.md) ·
[`brand-guidelines.md`](brand-guidelines.md) · [`theming.md`](theming.md)

## Pending

Design system (Phase 2).
