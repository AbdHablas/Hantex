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
| D-009 | Email sending service | Confirmed | Resend (free tier) |
| D-010 | Database backups | Confirmed | Neon's built-in restore plus nightly encrypted exports to R2 (30 daily, 12 monthly), restore-tested regularly |
| D-011 | Monitoring and error tracking | Confirmed | Cloudflare Workers logs (no personal data) plus scheduled health and backup checks that alert by email |
| D-012 | Brand reference | Confirmed | Brand guidelines and trademark sheet (2026) are the sources; icon mark SVGs extracted from the original artwork |
| D-013 | Brand typeface | Confirmed | Poppins for wordmark, headings and body (self-hosted) |
| D-014 | Website languages | Confirmed | Arabic (default, right-to-left first) and English |
| D-015 | Arabic typeface | Confirmed | Readex Pro for Arabic, paired with Poppins (both self-hosted, OFL-1.1) |
| D-016 | Previous Coming Soon project | Confirmed | Never deployed; no subscribers to migrate; D1 database left untouched. Its content is not reused as fixed text — the owner sets it from the dashboard |
| D-017 | Dashboard timing for the Coming Soon page | Confirmed | Phase 2 delivers the Coming Soon page together with the dashboard foundation |
| D-018 | Launch-notification sign-up | Confirmed | Email or WhatsApp number, with consent, Turnstile and rate limits; subscriber list and export in the dashboard |
| D-019 | Roles and permission matrix | Confirmed | Six standard roles; the matrix is editable from the dashboard (Phase 2) with escalation safeguards — see `docs/roles-and-permissions.md` |
| D-020 | Logo update | Confirmed | Updated mark from `hantex-ultra-edited2` (indicator dots, outlet-shaped socket holes), aligned to the brand palette and grid; dots light on all backgrounds |
| D-021 | Light and dark modes | Confirmed | Every public-facing design, including all SVGs, supports light and dark mode |
| D-022 | Central appearance customisation | Confirmed | Dashboard theme editor driving design tokens for all public sites; logo colours adjustable behind a brand warning |

Next: the owner's approval to start Phase 2.

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

## D-009 — Email sending service

- **Status:** Confirmed — 2026-10-20
- **Options considered:** Resend · Brevo · Amazon SES
- **Recommended:** Resend
- **Owner's choice:** Resend, starting on the free tier (about 3,000
  emails/month, 100/day at last check — to be confirmed on Resend's pricing
  page before sign-up).
- **Uses:** staff invitations, sign-in and recovery codes, contact and
  inquiry notifications.
- **Consequences:** sending domain records (SPF, DKIM, DMARC) are added to
  Cloudflare DNS only with the owner's approval; the Resend API key is stored
  as a Worker secret, never in the repository; a newsletter or mailing list,
  if wanted later, is a separate decision.

## D-010 — Database backups

- **Status:** Confirmed — 2026-10-20
- **Options considered:** Neon built-in restore plus nightly exports to R2 ·
  Neon built-in restore only · Neon paid plan
- **Recommended and chosen:** Neon built-in restore plus nightly exports.
- **Design:** a scheduled job (GitHub Actions) exports the whole database
  every night with a read-only backup user, encrypts the export, and stores
  it in a private R2 bucket; retention 30 daily and 12 monthly copies;
  restore tested regularly against a temporary Neon branch, never against
  production.
- **Cost:** US$0 (within GitHub Actions and R2 free allowances).
- **Owner responsibility:** keep the backup decryption key safe offline; it
  is also stored as a CI secret for the backup job.
- **Consequences:** documented restore procedure in `docs/` before launch;
  a failed backup triggers an email alert (see D-011).

## D-011 — Monitoring and error tracking

- **Status:** Confirmed — 2026-10-20
- **Options considered:** Cloudflare logs plus email alerts · the same plus
  Sentry free tier · basic logs only
- **Recommended and chosen:** Cloudflare logs plus email alerts.
- **Design:** structured logs in Cloudflare Workers Logs with no passwords,
  tokens, codes or unnecessary personal data; a scheduled check of the public
  site, the dashboard and the nightly backup that emails the owner through
  Resend on failure.
- **Cost:** US$0.
- **Consequences:** log history is short on the free plan (a few days);
  error tracking with a third party (for example Sentry) can be added later
  as a separate decision.

## D-012 — Brand reference

- **Status:** Confirmed — 2026-10-20
- **Sources (supplied by the owner):** Brand Guidelines v1 (2026), Trademark
  Reference Sheet v1 (2026), and an earlier Coming Soon project (zip).
- **Outcome:** brand analysed in `docs/brand-guidelines.md`; icon mark SVGs
  (on dark, on light, mono light, mono dark) extracted from the guidelines'
  vector artwork into `brand/logo/` and verified pixel by pixel against the
  PDF; previous project reviewed in `docs/previous-coming-soon-review.md`.
- **Not stored in the repository:** the PDFs and the zip (the repository is
  public; the trademark sheet is prepared for legal review).
- **Discrepancies found:** listed in `docs/brand-guidelines.md` — notably the
  trademark sheet's colour description contradicts its own specimens, and
  the typeface differs between documents (D-013).

## D-013 — Brand typeface

- **Status:** Confirmed — 2026-10-20
- **Options:**
  - **A. Poppins** for the wordmark, headings and body (recommended).
  - **B. Sora** for the wordmark and headings, **Inter** for body and
    interface text, as written in the trademark sheet.
- **Recommended:** A — every page of both PDFs, including the trademark
  sheet's own wordmark sample, is set in Poppins; one family means fewer
  font files and faster pages.
- **Owner's choice:** A — Poppins.
- **Consequences:** the trademark sheet's Sora/Inter wording is treated as an
  error for the owner to correct; fonts are self-hosted (no requests to
  Google); the lockup lettering is converted to outlines from the Poppins
  glyphs embedded in the guidelines artwork.

## D-014 — Website languages

- **Status:** Confirmed — 2026-10-20
- **Options considered:** Arabic main + English · Arabic only · English main
  + Arabic · English only
- **Recommended and chosen:** Arabic as the default language, designed
  right-to-left first, with a full English version.
- **Consequences:** every content type in the CMS is translatable from the
  start; layouts use direction-neutral (logical) CSS; each page carries
  `lang`, `dir` and `hreflang` alternates; an Arabic typeface is needed
  (Poppins has no Arabic letters); the Latin wordmark stays in Latin.
- **Default URL scheme (minor, may change):** Arabic at `/`, English under
  `/en/`.

## D-015 — Arabic typeface

- **Status:** Confirmed — 2026-10-20
- **Options considered (rendered samples shown to the owner):** Readex Pro ·
  Tajawal · IBM Plex Sans Arabic · Noto Kufi Arabic
- **Recommended and chosen:** Readex Pro.
- **Why:** geometric like Poppins, bold weight harmonises with the wordmark,
  clear body text, small files (about 10 KB per weight).
- **Consequences:** Arabic text uses Readex Pro; Latin text (including inside
  Arabic pages) uses Poppins. Both are licensed under the SIL Open Font
  Licence 1.1 and self-hosted (no requests to Google); only the weights
  actually used are shipped.

## D-016 — Previous Coming Soon project

- **Status:** Confirmed — 2026-10-20
- **Owner's answer:** the earlier project was **never deployed**; there are
  no real subscribers.
- **Consequences:** no data migration; the new Coming Soon page is built on
  the confirmed stack; the unused D1 database `hantex-ultra-db` is left
  untouched and may be deleted later only with the owner's explicit approval;
  its features and content are treated as ideas (see
  `docs/previous-coming-soon-review.md`).
- **Content (owner's answer):** launch date, tagline, milestones, progress,
  collections and finishes **will be set from the dashboard** — none of it
  is hard-coded. Until the owner enters it, the page shows only the brand and
  a neutral "coming soon" message (no dates, specifications or claims).

## D-017 — Dashboard timing for the Coming Soon page

- **Status:** Confirmed — 2026-10-20 (agreed change to the brief's phase order)
- **Options considered:** build the dashboard foundation together with the
  Coming Soon page · launch a brand-only page first, dashboard after
- **Recommended and chosen:** build both together.
- **Phase 2 scope now includes:** passkey sign-in (invite-only), the roles
  and permissions foundation, Coming Soon settings in Arabic and English,
  Publish (which rebuilds the static page), audit log, all behind
  Cloudflare Access.
- **Consequences:** the roles and permission matrix must be approved before
  Phase 2 starts; the full content-management dashboard (products, pages,
  media) remains Phase 3 and later; the public page stays brand-only until
  the owner publishes content.

## D-018 — Launch-notification sign-up

- **Status:** Confirmed — 2026-10-20
- **Options considered:** email or WhatsApp · email only · no sign-up
- **Recommended and chosen:** email **or** WhatsApp number.
- **Controls:** server-side validation and normalisation, Cloudflare
  Turnstile, rate limits, honeypot field, duplicate handling without
  revealing whether an entry exists, explicit consent checkbox with a privacy
  note (Arabic and English), only the contact value, its type, the consent
  text version and the time stored; subscriber list, delete and CSV export
  (formula-injection safe) in the dashboard, each action permission-checked
  and audited.
- **Launch-day messages:** email through Resend (batched across days within
  the free tier, or one month of a paid plan with the owner's approval);
  WhatsApp numbers contacted manually, or later through a WhatsApp service as
  a separate decision.

## D-019 — Roles and permission matrix

- **Status:** Confirmed — 2026-10-20
- **Input:** the owner plus about 2–5 staff will use the dashboard in the
  first year.
- **Proposal:** six roles — Owner, Administrator, Content Manager, Sales &
  Enquiries, Editor, Viewer — with the matrix and rules in
  `docs/roles-and-permissions.md` (server-side checks on every request, no
  self-promotion, no granting permissions one does not hold, last Owner
  protected, audited changes, owner-only site mode).
- **Owner's choice:** use the six roles as the standard set, and make the
  roles and permission matrix dynamic — editable from the dashboard.
- **Consequences:** roles are database records seeded with the six standard
  roles; permissions stay defined in code (each is a server-side check); the
  Owner role is locked; owner-only permissions cannot be given to other
  roles; every matrix change is audited and emailed to Owners; the matrix
  editor is built in Phase 2.

## D-020 — Logo update

- **Status:** Confirmed — 2026-10-21
- **Source:** `hantex-ultra-edited2.pdf` from the owner (Adobe Illustrator,
  12 October 2026), cover artwork only; not stored in the repository.
- **What changed in the mark:** the switch's Volt indicator dot and base line
  are replaced by three light indicator dots; the socket's two round holes
  are replaced by two mirrored outlet shapes (round hole on a flat bar).
  Frame, screws, bar, proportions and lettering are unchanged.
- **Owner's choices:**
  - align the file to the brand spec — socket in Ice instead of pure white,
    switch and dots back on the 27-unit grid (they were 0.1 pt off);
  - indicator dots stay light (Ice) on light backgrounds too.
- **Verification:** an exact rebuild of the supplied mark matched the PDF
  render pixel by pixel (differences only in anti-aliasing) before the
  clean-up was applied.
- **Consequences:** all twelve logo files regenerated; the trademark sheet and
  brand guidelines pages 2–8 show the previous mark and should be updated by
  the owner's designer; Volt no longer appears in the mark.

## D-021 — Light and dark modes

- **Status:** Confirmed — 2026-10-21 (owner's requirement)
- **Requirement:** every public-facing design supports light and dark mode,
  with adjustable colours; this includes every SVG.
- **Done so far:** adaptive logo files `brand/logo/mark.svg`, `lockup.svg`
  and `wordmark.svg` follow the viewer's system setting and accept CSS
  variable overrides; verified identical to the fixed variants in each mode.
- **Consequences:** see `docs/theming.md` — design tokens with separate light
  and dark values, inline token-driven SVGs on the site, lint rules against
  hard-coded colours.

## D-022 — Central appearance customisation

- **Status:** Confirmed — 2026-10-21 (design in `docs/theming.md`)
- **Requirement (owner):** a centralised customisation system in the
  dashboard to change colours, fonts and the overall frontend appearance of
  all public-facing websites, applied consistently.
- **Proposed design:** design tokens (palette → light/dark semantic tokens →
  components); Appearance section in the dashboard with draft, side-by-side
  light/dark preview, publish, version history, rollback and reset to brand
  defaults; publishing rebuilds the static sites from the tokens; WCAG AA
  contrast enforced; no custom CSS; fonts from a curated self-hosted
  library; new permissions *Appearance: edit drafts* and *Appearance:
  publish* (standard roles: Owner and Administrator).
- **Question:** the brand guidelines say the mark must never be recoloured —
  should the logo's colours be editable in the theme editor?
- **Options considered:** locked to the approved variants · adjustable with a
  warning · fully adjustable
- **Recommended:** locked to the approved variants.
- **Owner's choice:** adjustable with a warning.
- **Consequences:** the logo has its own colour tokens per mode (separate from
  the site accent, so changing the site's colours never recolours the logo by
  accident), defaulting to the brand colours; editing them shows a warning
  that this departs from the brand guidelines and needs confirmation; a
  visibility check warns if the logo would be hard to see on its
  background; every change is audited; *Reset logo to brand colours* is
  always available; a separate permission *Appearance: edit logo colours*
  is held by the Owner role only by default (changeable in the matrix).
