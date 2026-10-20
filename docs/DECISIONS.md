# Decision log

Every significant project decision is recorded here. A recommendation is only
marked **Confirmed** once the project owner has approved it.

**Statuses:** Proposed · Confirmed · Rejected · Pending · Blocked

## Summary

| ID | Topic | Status | Choice |
|----|-------|--------|--------|
| D-001 | Development tooling | Confirmed | Context7 and 21st.dev Magic as project MCP servers; Graphify and Strix installed per machine |
| D-002 | Agent skills location | Confirmed | Not stored in the repository; installed per session or per machine |
| D-003 | Frontend and backend stack | Confirmed | React + Vite admin, Workers + Hono, Neon + Hyperdrive, Drizzle, Better Auth, Tailwind + shadcn/ui + Lucide, Vitest + Playwright, with the recommended adjustments |
| D-004 | Public website framework | Confirmed | Astro |
| D-005 | Cost principle | Confirmed | Lowest cost: start on free tiers; every paid service needs owner approval |
| D-006 | Public site rendering | Confirmed | Static pages rebuilt on publish (a few minutes' delay), plus small server endpoints for forms |
| D-007 | Staff sign-in method and Workers plan | Confirmed | Passwordless: passkeys, emailed codes plus recovery codes for new devices and recovery; Workers Free |
| D-008 | Cloudflare account, plan and domain | Confirmed | Cloudflare Free; hantexultra.com active on Cloudflare DNS; no existing website or email; canonical host www |
| D-009 | Email sending service | Proposed | Resend free tier — awaiting owner's answer |

Upcoming decisions (asked one at a time, in roughly this order): monitoring
and backups, brand reference, roles and permission matrix.

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

- **Status:** Confirmed — 2026-10-20 (owner's stack with the adjustments below)
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
  1. Cloudflare Workers plan: password hashing (scrypt) is deliberately
     CPU-heavy and exceeds the Workers Free plan's per-request CPU limit.
     Under D-005 (lowest cost) this is re-decided with authentication:
     staying on the free plan requires passwordless staff sign-in
     (passkeys and emailed one-time codes); keeping passwords requires
     Workers Paid (about US$5/month).
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
- **Owner's choice:** confirmed as proposed, with the adjustments
- **Date confirmed:** 2026-10-20

## D-004 — Public website framework

- **Status:** Confirmed — 2026-10-20
- **Options considered:** Astro · React Router framework mode · Next.js (via
  the OpenNext adapter)
- **Recommended:** Astro
- **Owner's choice:** Astro
- **Why:** ships little or no JavaScript by default (best page speed for an
  animation-rich marketing and catalogue site), official Cloudflare adapter,
  can reuse React components and the shared Tailwind design tokens where a
  page needs interactivity.
- **Consequences:** two front-end apps (Astro public site, React dashboard)
  sharing design tokens and validation schemas in one repository.

## D-005 — Cost principle

- **Status:** Confirmed — 2026-10-20
- **Owner's choice:** lowest cost.
- **Consequences:** start on free tiers (Cloudflare Free, Workers Free, R2,
  Turnstile, Cloudflare Access, Neon Free) wherever they meet the
  requirements; prefer designs that keep usage inside free tiers (for
  example static pages over per-request rendering); every paid plan or
  service is proposed with its cost and needs the owner's approval; security
  requirements are never relaxed to save cost — where they conflict, the
  owner decides with both options costed.

## D-006 — Public site rendering

- **Status:** Confirmed — 2026-10-20
- **Options:**
  - **A. Static pages rebuilt on publish, plus small server endpoints**
    (recommended). Pages are generated ahead of time and served as static
    files; publishing in the dashboard triggers an automatic rebuild and
    deploy. Forms (contact, inquiries, launch sign-up) use small server
    endpoints with Turnstile and rate limits.
  - **B. Server-rendered on each request, with edge caching.** Content
    changes appear immediately; uncached page views run code and may query
    the database.
- **Recommended:** A.
- **Advantages of A:** no cost per page view (static files are served without
  running code); fastest pages; the public site never touches the database
  on page views, which shrinks the attack surface and lets the database
  sleep within Neon's free tier; any single page can still be switched to
  server rendering later.
- **Disadvantages of A:** published changes appear after a rebuild (usually
  a few minutes) rather than instantly; draft previews are served from the
  protected dashboard side, not the public site; the rebuild needs a
  narrowly scoped deploy credential.
- **Owner's choice:** A — a few minutes' delay after publishing is acceptable.

## D-007 — Staff sign-in method and Workers plan

- **Status:** Confirmed — 2026-10-20
- **Options:**
  - **A. Passwordless, on Workers Free (recommended).** Staff sign in with a
    passkey (fingerprint, face or device PIN, on phone or computer). New
    devices and recovery use an emailed one-time code plus a single-use
    recovery code. Invitations are emailed links that set up the first
    passkey. Better Auth `@better-auth/passkey` (SimpleWebAuthn) and
    `email-otp` plugins.
  - **B. Password plus authenticator app, on Workers Paid.** Familiar
    password sign-in with a second factor from an authenticator app;
    password reset by email. Needs Workers Paid (about US$5/month) because
    password hashing exceeds the free plan's per-request CPU limit.
- **Recommended:** A.
- **Advantages of A:** US$0; passkeys cannot be phished or reused from
  other sites' breaches; nothing to hash, store or leak as a password;
  verification is fast enough for the free plan.
- **Disadvantages of A:** less familiar to staff; each staff member needs a
  device with a screen lock (any modern phone or computer); recovery relies
  on email plus recovery codes, with an audited reset by a Super
  Administrator as the last resort; if the dashboard's server code outgrows
  the free plan's Worker size limit, Workers Paid is needed anyway (bundle
  size is checked during the build).
- **Common to both:** invite-only accounts, Turnstile on sign-in, database
  rate limits, revocable sessions, Cloudflare Access in front of the
  dashboard, audit log of sign-ins and account changes.
- **Deviation from the brief (approved with A):** password hashing and
  password reset do not apply; recovery is covered by the flow above.
- **Owner's choice:** A — passkeys, on Workers Free.
- **Consequences:** an email delivery service is required (invitations,
  sign-in codes); the dashboard Worker's bundle size is checked in CI against
  the free plan's limit; if it is exceeded, upgrading to Workers Paid is
  proposed to the owner.

## D-008 — Cloudflare account, plan and domain

- **Status:** Confirmed — 2026-10-20
- **Facts from the owner:** existing Cloudflare account on the **Free** plan;
  hantexultra.com is **active on Cloudflare** DNS; **no email** on the domain;
  **no website** live on the domain.
- **Consequences:** no DNS migration needed and no existing services to
  protect; the Coming Soon page can go live without replacing anything.
  `https://www.hantexultra.com` is the canonical address (per the brief); the
  bare domain redirects to it. Sending email from the domain needs SPF, DKIM
  and DMARC records, added only with the owner's approval. Any DNS change
  is proposed first and applied only after explicit approval.
