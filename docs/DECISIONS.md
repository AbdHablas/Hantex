# Decision log

Every significant project decision is recorded here. A recommendation is only
marked **Confirmed** once the project owner has approved it.

**Statuses:** Proposed · Confirmed · Rejected · Pending · Blocked

## Summary

| ID | Topic | Status | Choice |
|----|-------|--------|--------|
| D-001 | Development tooling | Confirmed | Context7 and 21st.dev Magic as project MCP servers; Graphify and Strix installed per machine |
| D-002 | Agent skills location | Confirmed | Not stored in the repository; installed per session or per machine |
| D-003 | Frontend and backend stack | Proposed | Owner's stack: React + Vite admin, Workers + Hono, Neon + Hyperdrive, Drizzle, Better Auth, Tailwind + shadcn/ui + Lucide, Vitest + Playwright — with recommended adjustments, awaiting confirmation |
| D-004 | Public website framework | Pending | Options: Astro (recommended), React Router framework mode, Next.js |

Upcoming decisions (asked one at a time, in roughly this order): rendering
strategy, database and data access layer, authentication and MFA, Cloudflare
plan and services, file storage, email delivery, monitoring and backups,
testing tools, brand reference, roles and permission matrix.

---

## D-001 — Development tooling

- **Status:** Confirmed — 2026-10-20
- **Choice:** Context7 (library docs) and 21st.dev Magic (UI generation) configured
  in `.mcp.json` with pinned versions; Graphify (code graph) and Strix (AI
  penetration testing) installed per developer machine when needed.
- **Consequences:** Keys live in each developer's environment, never in the
  repository (`.env.example` holds placeholders). Strix is only pointed at our
  own local or staging builds. Details in `docs/tooling.md`.

## D-002 — Agent skills location

- **Status:** Confirmed — 2026-10-20
- **Options considered:** keep all skills in the repository; keep a trimmed set;
  keep none in the repository.
- **Choice:** none in the repository. Skills from addyosmani/agent-skills,
  Strix, Context7, 21st.dev and Graphify are installed into the user's own
  Claude configuration per session or per machine.
- **Consequences:** The repository contains only project files. Cloud sessions
  need the skills reinstalled each time.

## D-003 — Frontend and backend stack

- **Status:** Proposed — owner's proposal, awaiting confirmation of the adjustments below
- **Owner's proposal (2026-10-20):**
  - Admin dashboard: React + Vite + TypeScript (single-page app)
  - Public website: separate, SEO-friendly (framework: see D-004)
  - Backend: Cloudflare Workers + Hono
  - Database: PostgreSQL on Neon via Cloudflare Hyperdrive
  - ORM: Drizzle
  - Authentication: Better Auth
  - UI: Tailwind CSS + shadcn/ui + Lucide
  - Testing: Vitest + Playwright
- **Previously considered:** A. Next.js + Payload CMS (integrated CMS) — not
  chosen by the owner. The owner's stack corresponds to option B (custom
  Cloudflare-native build).
- **Assessment:** sound, coherent and Cloudflare-native. Trade-off accepted
  with this choice: the content management system (editing UI, drafts,
  versions, scheduling, media library, page blocks, localization, previews,
  roles UI, audit log) is built in-house, which makes Phase 3 the largest phase.
- **Recommended adjustments (verified 2026-10-20 where noted):**
  1. Cloudflare Workers Paid plan: password hashing (scrypt) is deliberately
     CPU-heavy and exceeds the free plan's per-request CPU limit.
  2. Better Auth handles authentication only (sign-in, sessions, password reset,
     two-factor, invitations). Roles and permissions live in our own tables,
     enforced by Hono middleware, because Better Auth's built-in roles are
     fixed in code. Audit logging is our own table, because Better Auth's audit
     log is part of its paid hosted service.
  3. Better Auth settings: no public sign-up (invite only); two-factor required
     for staff; rate-limit storage in the database (in-memory storage does not
     work across Workers instances — per Better Auth docs); Drizzle adapter
     with `transaction: true`; breached-password check; Turnstile on sign-in;
     `nodejs_compat` flag on the Worker.
  4. Hyperdrive with the standard Postgres driver (Neon's HTTP driver would
     bypass Hyperdrive). Two connections: cached and read-only for the public
     site, uncached for the dashboard and sign-in. The public site's database
     user can only read.
  5. Dashboard on its own subdomain, with the app and its API on the same
     origin (simple secure cookies, no CORS), and Cloudflare Access in front of
     it as a second lock.
  6. Neon branches for development, preview and production; production plan
     and restore window decided in the backups step.
  7. Vitest 4.x: Cloudflare's Workers test pool (`@cloudflare/vitest-pool-workers`
     0.23) supports Vitest ^4.1, not Vitest 5. Add axe accessibility checks,
     Lighthouse performance checks, dependency scanning, and role-matrix tests
     for every API endpoint.
  8. shadcn/ui for the dashboard; the public site shares the Tailwind design
     tokens but gets custom-designed components so it doesn't look like a
     template. Lucide for interface icons; custom SVG icons for product symbols.
  9. Minor choices (owner may override): Zod schemas shared by API and
     dashboard; TanStack Router and Query in the dashboard; R2 for files; Cron
     Triggers for scheduled publishing; Postgres full-text search for products;
     rich text stored as structured JSON rather than raw HTML.
- **Owner's choice:** —
- **Date confirmed:** —

## D-004 — Public website framework

- **Status:** Pending
- **Options:** Astro (recommended) · React Router framework mode · Next.js
  (via the OpenNext adapter)
- **Owner's choice:** —
