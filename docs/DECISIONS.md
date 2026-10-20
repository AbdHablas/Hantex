# Decision log

Every significant project decision is recorded here. A recommendation is only
marked **Confirmed** once the project owner has approved it.

**Statuses:** Proposed · Confirmed · Rejected · Pending · Blocked

## Summary

| ID | Topic | Status | Choice |
|----|-------|--------|--------|
| D-001 | Development tooling | Confirmed | Context7 and 21st.dev Magic as project MCP servers; Graphify and Strix installed per machine |
| D-002 | Agent skills location | Confirmed | Not stored in the repository; installed per session or per machine |
| D-003 | Frontend and backend stack | Proposed | Awaiting owner's choice — recommended: Next.js + Payload CMS on Cloudflare Workers |

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

- **Status:** Proposed — awaiting the owner's choice
- **Options considered:**
  - **A. Next.js + Payload CMS (TypeScript), on Cloudflare Workers.** One
    application: public site, admin dashboard and API. Payload supplies the
    CMS foundation (content models, admin UI, drafts and versions, scheduled
    publishing, localization, media library, server-side access control).
  - **B. Custom Cloudflare-native modular monolith (TypeScript).** Next.js or
    Astro for the public site, a Hono API on Workers, a React + Vite admin
    dashboard, Drizzle ORM and Better Auth. Every CMS feature is built in-house.
  - **Ruled out:** a React + Vite single-page app for the public site (renders
    in the browser, weaker SEO); Laravel + Filament (not Cloudflare-native,
    second language for the animated frontend).
- **Recommended:** A.
- **Advantages of A:** least custom security-critical code; mature, tested CMS
  features; server rendering for SEO; one typed codebase; official Cloudflare
  template maintained by Payload (D1 + R2).
- **Disadvantages and limits of A (verified 2026-10-20, Payload 3.91):**
  requires the Workers Paid plan because of the bundle size; image crop,
  focal point and server-side resizing are unavailable on Workers (no `sharp`),
  so resizing would use Cloudflare image transformations; GraphQL is not
  guaranteed on Workers (we would use REST and Payload's server-side API);
  no built-in multifactor authentication (must be added); permissions are
  defined in code, so dashboard-managed roles need a custom permission layer.
- **Advantages of B:** full control; smallest runtime footprint; Better Auth
  includes two-factor authentication, an admin/access-control plugin and
  Turnstile support.
- **Disadvantages of B:** the whole CMS — editing UI, drafts, versions,
  scheduling, media library, page-block builder, localization, previews —
  is built and secured from scratch: several times the effort and more code
  to maintain.
- **Cost notes:** Cloudflare Workers Paid starts at about US$5/month; both
  options avoid licence fees.
- **Owner's choice:** —
- **Date confirmed:** —
