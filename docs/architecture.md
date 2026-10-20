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
| Public website | Astro, Tailwind CSS, shared design tokens, custom components |
| Admin dashboard | React + Vite + TypeScript, Tailwind CSS, shadcn/ui, Lucide |
| API | Hono on Cloudflare Workers |
| Authentication | Better Auth — sign-in, sessions, two-factor, invitations; invite-only |
| Authorisation | Own roles and permissions tables, enforced by Hono middleware on every request |
| Audit log | Own table |
| Database | PostgreSQL on Neon, via Cloudflare Hyperdrive, standard Postgres driver |
| Data access | Drizzle ORM with versioned migrations |
| Validation | Zod schemas shared by API and dashboard |
| Files | Cloudflare R2 |
| Testing | Vitest 4.x (with Cloudflare's Workers test pool), Playwright, axe accessibility checks, Lighthouse |

## Security boundaries (confirmed)

- The dashboard and its API share one origin on their own subdomain, behind
  Cloudflare Access.
- Public site database access, where needed, uses a separate read-only
  database user; dashboard access uses an uncached connection.
- No public sign-up; staff accounts are created by invitation.
- Secrets live in Cloudflare and CI secret stores, never in the repository.

## Cost

Lowest cost (D-005): free tiers first, paid services only with owner
approval. The Workers plan is decided together with authentication.

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

## Pending

Staff sign-in method and Workers plan (D-007),
Cloudflare plan and services, email delivery, monitoring and backups,
brand and design system, roles and permission matrix.
