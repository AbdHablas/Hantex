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
| D-015 | Arabic typeface | Superseded by D-031 | Readex Pro for Arabic, paired with Poppins (both self-hosted, OFL-1.1) |
| D-016 | Previous Coming Soon project | Confirmed | Never deployed; no subscribers to migrate; D1 database left untouched. Its content is not reused as fixed text — the owner sets it from the dashboard |
| D-017 | Dashboard timing for the Coming Soon page | Confirmed | Phase 2 delivers the Coming Soon page together with the dashboard foundation |
| D-018 | Launch-notification sign-up | Confirmed | Email or WhatsApp number, with consent, Turnstile and rate limits; subscriber list and export in the dashboard |
| D-019 | Roles and permission matrix | Confirmed | Six standard roles; the matrix is editable from the dashboard (Phase 2) with escalation safeguards — see `docs/roles-and-permissions.md` |
| D-020 | Logo update | Confirmed | Updated mark from `hantex-ultra-edited2` (indicator dots, outlet-shaped socket holes), aligned to the brand palette and grid; dots light on all backgrounds |
| D-021 | Light and dark modes | Confirmed | Every public-facing design, including all SVGs, supports light and dark mode |
| D-022 | Central appearance customisation | Confirmed | Dashboard theme editor driving design tokens for all public sites; logo colours adjustable behind a brand warning |
| D-023 | Latest versions policy | Confirmed | Latest stable release of every platform and library: Node.js 26, pnpm 12, PostgreSQL 18; recorded exceptions (TypeScript 6.0 until the lint tools support 7) |
| D-024 | Multi-website platform | Confirmed | One dashboard manages any number of sites, each with its own branding, design, content, products and configuration — see `docs/multi-site.md` |
| D-025 | Staff access across websites | Confirmed | Roles assigned per site, with an "all sites" option; Owners always cover all sites |
| D-026 | Product-focused catalogue | Confirmed | Switches and sockets first; lighting, lamps, accessories; each site owns its catalogue — see `docs/product-catalogue.md` |
| D-027 | Reusable design system across websites | Confirmed | Theme per site from presets; font library and SVG logo uploads in the dashboard — see `docs/theming.md` |
| D-028 | Hosting of multiple websites | Confirmed | One Cloudflare Worker per site (static pages + forms), media from R2 on a media domain per site |
| D-029 | AI 3D Product Studio | Confirmed | Provider-based module with quality gates, honest labels and approval before publishing — see `docs/3d-product-studio.md` |
| D-030 | 3D processing location, providers and budget | Confirmed | No CAD files. Free photogrammetry on the owner's Mac, LiDAR iPhone/iPad and GPU PC. Self-hosted runner. No paid AI services. |
| D-031 | Arabic typeface (revisits D-015) | Confirmed | Cairo for Arabic on the public sites and the dashboard, paired with Poppins; self-hosted; other fonts stay in the library |
| D-032 | Typography system | Confirmed | Named text styles (display, headings, body, navigation, buttons, labels, product titles, prices and specs) with separate Arabic and Latin fonts, presets, preview, publish and rollback per site |
| D-033 | Custom fonts | Confirmed | Owner uploads WOFF2 files with a licence confirmation; validated, self-hosted from R2; no third-party font services |
| D-034 | Component system across dashboard and public sites | Confirmed | Shared design tokens; dashboard on Radix/shadcn-style React components; public sites stay Astro with zero-JS components and small islands only where interaction needs them |
| D-035 | Website builder model | Confirmed | A structured section registry with validated settings and a page editor with live device preview; no free HTML, CSS or scripts — see `docs/website-builder.md` |
| D-036 | Builder editing libraries | Confirmed | dnd-kit for drag and drop (keyboard accessible); Tiptap for limited rich text stored as JSON |
| D-037 | Publishing model for the builder | Confirmed | Drafts per item; one *Publish changes* per site with validation, versions, rollback and automatic redirects |
| D-038 | Shared templates and global sections | Confirmed | Templates copied into a site when used; global sections shared within one site only |
| D-039 | Builder scope and order | Confirmed | 3a builder core without media, 3b media library, 3c product catalogue; Coming Soon stays a site mode |
| D-040 | Launch announcement to sign-ups | Confirmed | Email from the dashboard through Resend, with unsubscribe links; WhatsApp numbers exported for manual sending |
| D-041 | Privacy policy page | Confirmed | Draft written from what the platform actually does, marked for the owner's (or a lawyer's) review; published only after approval |
| D-042 | Visitor statistics | Confirmed | Cloudflare Web Analytics: free, cookieless; figures on each website's overview |
| D-043 | Automated accessibility checks | Confirmed | axe-core in the browser tests of the dashboard and the sites |
| D-044 | Image processing | Confirmed | In the dashboard, before upload: resized to a few widths, WebP, camera and location data removed; the server re-checks every file |
| D-045 | General catalogue | Confirmed | Any kind of product on any website: categories, attributes and page templates are data per site; switches and sockets are Hantex Ultra's first categories, not built in |

All open decisions are settled. Next: the media library (Phase 3b, D-044),
then the general product catalogue (Phase 3c, D-045).

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
  7. Vitest: *updated 2026-10-21* — Cloudflare renamed its Workers test
     integration to `@cloudflare/vitest-plugin` (1.x), which supports Vitest 5,
     so Vitest 5 is used (the earlier Vitest 4 pin applied to the old
     `@cloudflare/vitest-pool-workers` 0.23). Add axe accessibility checks,
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
- **Update 2026-10-21:** Cloudflare removed the compressed Worker size limits
  (previously 3 MB on Free) on 2026-09-04. Workers on every plan may now be up
  to 64 MiB uncompressed
  ([changelog](https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/),
  [limits](https://developers.cloudflare.com/workers/platform/limits/)), so
  bundle size is no longer a likely reason to need Workers Paid. The CI size
  check stays. The Free plan's 10 ms of CPU per request still applies.

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

- **Status:** Superseded by D-031 on 2026-10-21 (was Confirmed 2026-10-20)
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

## D-023 — Latest versions policy

- **Status:** Confirmed — 2026-10-21 (owner's instruction: "use the latest
  versions of the platforms")
- **Policy:**
  - Use the latest **stable** release of every platform, framework and
    library when it is added or updated, pinned exactly.
  - Automated update pull requests keep versions current.
  - Pre-releases (alpha, beta, release candidates) are never used.
  - When the newest major version can't be used yet, the exception is
    recorded here with its reason and re-checked monthly.
- **Checked on 2026-10-21** against the npm registry, the Node.js release
  schedule and Neon's changelog:
  - **Node.js 26** (26.12.0) replaces 22 for tooling and CI. It becomes
    Active LTS on 2026-10-28. Workers run on Cloudflare's own runtime, so
    this affects builds and tests only.
  - **pnpm 12** (12.14.0) replaces 10.28. pnpm 11 replaced
    `onlyBuiltDependencies` with `allowBuilds`, and the upgrade migrates it.
    pnpm 11+'s safer defaults are kept: a minimum release age of one day,
    and blocking of exotic sub-dependencies.
  - **PostgreSQL 18** replaces 17 in CI. It has been Neon's default for new
    projects since 2026-06-05
    ([changelog](https://neon.com/docs/changelog/2026-06-05)).
  - **Already the latest:**
    - Astro 7.4.1 and @astrojs/cloudflare 14.4.1;
    - React 19.3.1, Tailwind CSS 4.3.3, shadcn 4.22.1;
    - Hono 4.13.13, Zod 4.6.7, Better Auth 1.7.12;
    - Vitest 5.0.5, Playwright 1.64.1, ESLint 10.13.0, Prettier 3.9.10;
    - wrangler 4.151.3;
    - the pinned GitHub Actions (checkout 7.0.1, setup-node 7.1.0, pnpm
      action 6.1.0).
  - **Patch updates:** Vite 8.3.5, lucide-react 1.61.0, Workers types
    5.20261021.1.
- **Exceptions:**
  - **TypeScript stays on 6.0.3.** TypeScript 7.0.2 is the latest, but:
    - typescript-eslint 8.72 (its latest) supports TypeScript below 6.1;
    - Astro's checker supports TypeScript 5–6;
    - TypeScript 7.0 has no stable programmatic API until 7.1, which is still
      in beta.

    A CI check will compile the code with TypeScript 7 so the switch is quick
    when the tools are ready.
  - **Drizzle ORM stays on 0.45.4,** the latest stable release; 1.0 is a
    release candidate.
  - **Releases less than a day old wait a day** (pnpm's `minimumReleaseAge`,
    kept on purpose). On 2026-10-21 that meant Vite 8.3.4, lucide-react
    1.60.0 and Workers types 5.20261019.1 instead of the releases from that
    morning. No exemptions are added for convenience.
  - **`@simplewebauthn/browser` stays on 13.3.0** in the dashboard, matching
    the version 13 server library that Better Auth's passkey plugin uses;
    version 14 is a new major for the browser side only.
- **Done (2026-10-21):** Node.js 26.12.0, pnpm 12.14.0 (`allowBuilds`) and
  PostgreSQL 18 in CI. Format, lint, type-check and all 77 tests passed
  locally on Node.js 26.12.0 with PostgreSQL 18.4. Details in
  `docs/development.md`.

## D-024 — Multi-website platform

- **Status:** Confirmed — 2026-10-21 (requirement and design; design approved by the owner the same day)
- **Requirement (owner):** the dashboard is a central management platform for
  any website the owner creates, not only www.hantexultra.com. Each website
  has its own branding, design settings, content, products and
  configuration, sharing the same dashboard and management system where
  appropriate.
- **Design** (`docs/multi-site.md`, approved 2026-10-21):
  - **Every public website is a *site*** with its own domains, languages,
    mode, theme, content, catalogue, sign-ups and enquiries.
  - **Shared by all sites:** staff accounts, role definitions, the font
    library and design-system components, publishing, the 3D Studio, email,
    monitoring and backups.
  - **In the dashboard:** a site switcher, and site-scoped API addresses with
    permission checks per site on every request.
  - **New sites:** created by the Owner in the dashboard, starting in Coming
    Soon mode.
- **Consequences:**
  - The Phase 2 database and API become site-aware before anything is
    deployed. There is no production data, so the migrations are revised.
  - Hantex Ultra is the first site.
  - The parked API work (branch `wip/dashboard-api`) is adapted before it is
    merged.

## D-025 — Staff access across websites

- **Status:** Confirmed — 2026-10-21 (owner chose A)
- **Options:**
  - **A. Per site, with an "all sites" option (recommended).** A role is
    assigned for one site, or for all sites. Owners always cover all sites.
  - **B. One role for all sites.** Everyone with access works on every site
    within their role.
- **Why A:**
  - least privilege: staff of one brand never see another site's customers;
  - flexible as more sites are added;
  - no change for Owners.
- **Owner's choice:** A, per site with an "all sites" option.
- **Trade-off:** inviting someone means choosing their sites, and there are
  more cases to test. Details in `docs/multi-site.md` and
  `docs/roles-and-permissions.md`.

## D-026 — Product-focused catalogue

- **Status:** Confirmed — 2026-10-21 (requirement and structure; structure approved by the owner the same day)
- **Requirement (owner):** Hantex Ultra is a brand specialising in
  electrical switches, sockets, lighting, lamps and related accessories.
  Switches and sockets are the main
  categories and lead the product structure, navigation, categorisation and
  presentation. Lamps, lighting and accessories are also supported.
- **Structure** (`docs/product-catalogue.md`, approved 2026-10-21):
  - categories, as a tree with *main* categories;
  - series (design lines);
  - products, with variants usually by finish;
  - reusable finishes;
  - typed attributes defined in the dashboard;
  - documents, photos and 3D models;
  - Apple-style product and series pages built from blocks.
- **Starting categories for Hantex Ultra:** Switches and Sockets (main),
  then Lighting, Lamps and Accessories, as named by the owner.
  Sub-categories, series, attributes and finishes are entered by the owner's
  team.
- **Rules:**
  - Each site owns its products, following the owner's requirement that each
    website has its own products. *Copy to another site* reuses stored
    files.
  - No product fact is shown unless entered.
  - Certification marks are shown only with a verified supporting document.
  - Prices and online ordering are out of scope unless decided later.

## D-027 — Reusable design system across websites

- **Status:** Confirmed — 2026-10-21 (requirement and design; design approved by the owner the same day)
- **Requirement (owner):**
  - an SVG design system with light/dark support and adaptable colours for
    different public-facing websites;
  - colours, fonts, typography and other visual settings customised
    centrally without code changes;
  - new websites, brands, categories, themes, fonts and palettes added
    without rebuilding.
- **Design** (`docs/theming.md`, approved 2026-10-21):
  - **One theme per site,** starting from presets (Hantex Ultra brand,
    neutral, or a copy), with named palettes.
  - **A platform font library** managed in the dashboard: validated WOFF2
    uploads with their licences.
  - **Sanitised SVG logo uploads,** with their colours mapped to theme tokens
    to make adaptive light/dark logos.
  - **`currentColor` icons.**
  - **Templates and components that use tokens only.**
- **Boundary:** new templates and new content block types are development
  work. Everything else is done in the dashboard.

## D-028 — Hosting of multiple websites

- **Status:** Confirmed — 2026-10-21 (owner chose option A)
- **Options:**
  - **A. One Cloudflare Worker per site (recommended).** Each serves its
    static pages and form endpoints. Media comes from R2 through a media
    domain for each site.
  - **B. One shared Worker for all sites,** choosing the site by domain on
    every request.
- **Why A:**
  - static-asset requests are free and unlimited and run no code
    ([Cloudflare](https://developers.cloudflare.com/workers/platform/pricing/));
  - each site deploys and rolls back on its own;
  - a mistake in one site can't take down the others.

  Option B would run code on every page view and share the Free plan's
  100,000 requests per day across all sites.
- **Cost:** US$0 within free tiers. The Free plan allows 100 Workers and
  20,000 static files per Worker version
  ([limits](https://developers.cloudflare.com/workers/platform/limits/)).
  Media served from R2 has no egress charge.
- **Consequences:**
  - The Hantex Ultra Worker is `site-hantex-ultra`.
  - Site configuration is generated at build time from the dashboard's site
    records.
  - Domains and DNS change only through deployments the owner approves.
  - 3D model files need a Cache Rule on the media domain, because Cloudflare
    doesn't cache `.glb` files by default
    ([default cache behaviour](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)).

## D-029 — AI 3D Product Studio

- **Status:** Confirmed — 2026-10-21 (requirement and approach; approach approved by the owner the same day, with the D-030 answers applied)
- **Requirement (owner):**
  - a reusable dashboard module, for every website, that turns real product
    photos (front, side, rear, detail) into interactive 3D models;
  - the models keep the real shape, proportions, colours, materials,
    finishes, buttons and socket openings, with nothing invented;
  - Apple-style product pages;
  - preview, adjust, approve, assign and publish;
  - originals, models and previews kept per product;
  - optimised delivery with a fallback image;
  - modular providers, chosen for cost;
  - quality control, with no automatic publishing and the owner's approval;
  - a clear distinction between true 3D models and AI images or animations
    that only look 3D;
  - an honest warning when the photos aren't enough.
- **Key finding:** a few photos can't be *measured*.
  - True reconstruction needs CAD files or a full capture of dozens of
    overlapping photos.
  - AI image-to-3D from a few photos *estimates* the shape and invents
    whatever it can't see.
- **Evaluation (2026-10-21, sources in the document):**
  - **CAD conversion:** US$0, exact. Best for switches and sockets.
  - **Photogrammetry:** US$0 with Apple Object Capture (Mac or LiDAR iPhone)
    or RealityScan or COLMAP on a suitable PC. RealityScan is free below
    US$1M company revenue. Without suitable hardware, the KIRI Engine app
    costs US$17.99 a month.
  - **AI image-to-3D:** about US$0.20–0.90 per attempt. Tripo is pay-as-you-go
    and recommended for a trial; Rodin is the alternative. Meshy's terms
    allow training on uploads, so it is not recommended for unreleased
    products.
  - **AI video:** US$0.10–0.40 a second, and not 3D.
  - **3D artist:** quoted per product.
- **Recommended route:**
  1. CAD first.
  2. Modular assembly where ranges are modular.
  3. Full capture plus photogrammetry otherwise.
  4. AI only as a labelled draft.
  5. An artist for hero products.
- **Approach** (`docs/3d-product-studio.md`, approved 2026-10-21):
  - **Labels set by method, not by providers' claims:** Exact (CAD),
    Measured, Artist-modelled, Captured view, AI-estimated, and AI imagery
    (not 3D).
  - **Six quality gates,** from capture checks to the Owner's approval.
  - **One provider interface,** with free CAD conversion and model import
    first.
  - **A private processing runner;** never this public repository's CI.
  - **Website delivery:** model-viewer with posters, finish variants and
    true-scale "view on your wall".
  - **Paid AI providers** only with the Owner's approval and a budget.
- **Consequences:**
  - Stage 1 is built in Phase 3, stage 2 in Phase 4.
  - Storage is estimated at under about US$2.50 a month per 100 fully
    captured products on R2.
  - Processing is free within GitHub's private-repository allowance or on
    the owner's own hardware.

## D-030 — 3D processing location, providers and budget

- **Status:** Confirmed — 2026-10-21
- **Questions:**
  1. Are CAD files available from the factory or supplier?
  2. Which capture equipment is available: a Mac with Apple silicon, an
     iPhone or iPad with LiDAR, a Windows PC with an NVIDIA graphics card?
  3. Is there a monthly budget for paid AI 3D services, or free methods
     only?
- **Answer 1 (2026-10-21): no CAD files are available.** Photo capture
  (photogrammetry) becomes the main path for measured models, with an artist
  and labelled AI drafts as options. CAD import stays in the Studio for any
  files that turn up later.
- **Answer 2 (2026-10-21): a Mac, an iPhone or iPad with LiDAR, and a
  Windows PC with an NVIDIA or AMD graphics card are all available.** Photo
  reconstruction runs free on the owner's own hardware: Apple Object Capture
  on the Mac (main path), LiDAR capture on the iPhone or iPad for quick
  true-scale models, and RealityScan or COLMAP on the PC as a second option.
  The KIRI Engine subscription isn't needed. The Mac or PC can also act as the
  self-hosted processing runner, so unreleased product photos never leave the
  owner's machines. The exact Mac chip and iPhone or iPad model are checked
  when capture starts.
- **Answer 3 (2026-10-21): free methods only.** No paid AI 3D services. The
  provider interface keeps a slot for them, but every AI provider stays
  switched off with a US$0 budget until the owner approves one.
- **Result:** Confirmed. Photogrammetry on the owner's own hardware is the
  main path, with LiDAR capture for quick true-scale models. Processing runs
  on a self-hosted runner on the owner's Mac or PC. A 3D artist is quoted
  per product only if the owner asks.
- **Why it matters:** CAD gives exact models at no cost. Capture equipment
  decides whether photo reconstruction can run for free on the owner's
  hardware. The budget decides whether AI drafts are offered at all.

## D-031 — Arabic typeface (revisits D-015)

- **Status:** Confirmed — 2026-10-21
- **Requirement (owner):** replace the current Arabic font with a more
  modern, professional typeface with excellent readability and full support
  for diacritics; Arabic and Latin fonts configurable separately per site.
- **Options considered (rendered side by side on product-card content, with
  Poppins for Latin):** IBM Plex Sans Arabic · Noto Sans Arabic · Tajawal ·
  Readex Pro (current).
- **Findings:** IBM Plex Sans Arabic has the most even body text, matches
  Poppins' letter heights best and sets compactly; Noto Sans Arabic is very
  clear but has much taller lines, which push layouts down; Tajawal looks
  small and light at the same size and is weaker in body text; Readex Pro is
  wide and heavy in body text.
- **Recommended:** IBM Plex Sans Arabic (SIL OFL 1.1, self-hosted, five
  weights) as the default Arabic font for the public sites and the dashboard.
  Readex Pro and the others stay in the library, so a site can still choose
  them.
- **Owner's choice:** Cairo (Google Fonts design, SIL OFL 1.1). It is
  self-hosted from the `@fontsource/cairo` package, like every other font, so
  visitors' browsers never contact Google and the security policy stays
  strict. Its diacritics and Arabic numerals render well; its lines are a
  little taller, so Arabic text gets a larger line height (1.75 on the sites,
  1.7 in the dashboard).
- **Consequences:** the brand theme and the dashboard switch to Cairo for
  Arabic. Latin text, including product names and model numbers inside
  Arabic pages, stays in Poppins. Cairo, IBM Plex Sans Arabic, Tajawal and
  Readex Pro all stay in the library for other sites. Existing sites keep
  their published theme until a new one is published. D-015 is superseded.

## D-032 — Typography system

- **Status:** Confirmed — 2026-10-21 (owner chose text styles with presets)
- **Requirement (owner):** a Typography & Fonts section per site: font
  families for the whole frontend; styles for headings, body text,
  navigation, buttons, product titles, labels and more; sizes, weights, line
  heights and letter spacing; curated presets; preview, publish and revert
  without code.
- **Proposed:** the theme gains named *text styles* (display, heading 1–3,
  body, small, navigation, button, label, product title, price and
  specifications). Each style sets a font role (heading or body), size,
  weight, line height and letter spacing, with separate values for Arabic
  where they differ (Arabic needs more line height and no letter spacing).
  Two font roles, heading and body, each have an Arabic and a Latin family.
  Everything becomes CSS variables used by every component. Curated
  typography presets come with the existing theme presets (D-027). Editing
  uses the existing draft, side-by-side preview, publish, history and
  rollback. Limits keep text readable (minimum sizes, no letter spacing on
  Arabic, contrast checks unchanged).
- **Consequences:** a theme schema version 2, with automatic migration of
  existing themes.

## D-033 — Custom fonts

- **Status:** Confirmed — 2026-10-21 (owner chose uploads, option b)
- **Requirement (owner):** add supported custom fonts besides the curated
  presets.
- **Options:** (a) curated library only; new fonts added by a reviewed code
  change · (b) the Owner uploads WOFF2 files in the dashboard, confirming the
  licence permits web use; files are validated, stored in R2 and served from
  the site's own domain · (c) pick any Google Font by name, loaded from
  Google.
- **Recommended:** (b), limited to the Owner (a new permission *Fonts:
  upload*), WOFF2 only, a size limit, checked to be a real font and to cover
  the script it is uploaded for. (c) is not recommended: it sends visitors'
  addresses to Google and loosens the security policy.
- **Depends on:** the R2 media storage arriving with the media library
  (Phase 3). Until then, option (a) applies.

## D-034 — Component system across dashboard and public sites

- **Status:** Confirmed — 2026-10-21 (owner chose option a)
- **Requirement (owner):** one consistent, reusable, premium component system
  across all websites and the dashboard; modern libraries compatible with the
  stack; no unnecessary dependencies; fast loading.
- **Options:** (a) shared design tokens; dashboard on Radix primitives with
  shadcn-style React components (as now); public sites as Astro components
  that ship no JavaScript by default, with small islands only for interactive
  parts (product filters, gallery, 3D viewer) · (b) React everywhere,
  including the public sites · (c) a single web-components library used by
  both.
- **Recommended:** (a). The public sites stay fastest (static HTML, scripts
  only where needed). Look and behaviour stay consistent through the shared
  tokens and matching component designs. The 3D viewer is the
  `<model-viewer>` web component, loaded only on product pages.
- **Consequences:** each public component has a matching dashboard preview
  using the same tokens; the strict security policy stays (no inline scripts
  or styles).

## D-035 — Website builder model

- **Status:** Confirmed — 2026-10-22 (owner chose option a)
- **Requirement (owner):** create and manage several independent websites;
  pages, sections and menus managed visually, previewed on phone, tablet and
  desktop, and published without code (`docs/website-builder.md`).
- **Options:** (a) our own structured section registry: each section type
  has a validated settings schema, a site renderer and a dashboard form; a
  page editor with a section list (drag to reorder), a settings panel and the
  real site shown in a device-sized preview · (b) an open-source visual page
  builder such as Puck, which edits React components on a canvas · (c) a
  free-form builder such as GrapesJS, which stores HTML and CSS.
- **Recommended:** (a). It keeps the public sites static and fast (D-034), the
  preview is the real site, bilingual fields and right-to-left layout are
  built in, and nothing free-form reaches the pages, so the strict security
  policy holds. (b) would mean maintaining every section twice (React for the
  editor, Astro for the sites). (c) stores free HTML and CSS, which the
  security rules forbid.
- **Consequences:** the dashboard's security policy allows framing the
  sites' preview address, and the preview allows being framed only by the
  dashboard's address.

## D-036 — Builder editing libraries

- **Status:** Confirmed — 2026-10-22 (owner chose dnd-kit and Tiptap)
- **Options:** dnd-kit (drag and drop, works with keyboard and screen readers,
  MIT) · Tiptap (rich text on ProseMirror, MIT) stored as JSON and rendered by
  our own code · or buttons only (move up/down) and plain text with line
  breaks, adding no libraries.
- **Recommended:** dnd-kit and Tiptap, limited to headings, bold, italic,
  lists and links. Both are widely used, free and work with the strict
  security policy (to be verified in the browser tests).

## D-037 — Publishing model for the builder

- **Status:** Confirmed — 2026-10-22 (owner chose option a)
- **Options:** (a) drafts per item (page, menu, theme, settings) and one
  *Publish changes* per site that validates everything changed, records
  versions and rebuilds once · (b) each page publishes on its own, one
  rebuild per publish.
- **Recommended:** (a): related changes (a new page and its menu link) go live
  together, there is one rebuild, and validation sees the whole site. Rollback
  per item stays available. Changed slugs and unpublished pages get redirects.

## D-038 — Shared templates and global sections

- **Status:** Confirmed — 2026-10-22 (owner chose copied templates)
- **Options for templates shared across websites:** copied into the site
  when used (later template changes never affect existing sites) · linked
  with per-site overrides (template changes flow into every site using them).
- **Recommended:** copied. Within one website, global sections (header,
  footer and saved sections) are linked, so editing one updates every page of
  that site. Nothing is ever linked across websites.

## D-039 — Builder scope and order

- **Status:** Confirmed — 2026-10-22 (owner approved the order)
- **Proposed:** Phase 3a builds the essential builder without media (guided
  new website, duplicate website, pages, sections without images, header and
  footer menus, publish changes, device preview). Phase 3b adds the media
  library on R2, logo and image uploads and image sections. Phase 3c adds the
  product catalogue and product sections; 3D follows in Phase 4. The Coming
  Soon page remains a site mode: built pages go public only when the owner
  switches a site to live.

## D-040 — Launch announcement to sign-ups

- **Status:** Confirmed — 2026-10-22
- **Options:** email through Resend plus a WhatsApp list export · email and
  WhatsApp through Meta's Business API (per-message charges, verified business
  account) · export only.
- **Owner's choice:** email through Resend, WhatsApp export.
- **Consequences:** the dashboard composes a bilingual announcement per site,
  sends it in batches within Resend's free limits (checked at setup; large
  lists are spread over days), with an unsubscribe link in every email that
  removes the address; sending is a permission held by Owner and
  Administrator, and each send is audited. WhatsApp numbers are exported for
  manual sending; no paid service is used.

## D-041 — Privacy policy page

- **Status:** Confirmed — 2026-10-22
- **Options:** a draft written by Claude for review · text from the owner or a
  lawyer · a link to an existing policy.
- **Owner's choice:** a draft for review.
- **Consequences:** the draft states only what the platform actually does
  (data collected, purpose, retention, deletion, the services involved). It
  is clearly marked as not legal advice and needs the owner's (or a
  lawyer's) review. It becomes a normal page in the builder and goes live only
  after the owner approves it.

## D-042 — Visitor statistics

- **Status:** Confirmed — 2026-10-22
- **Options:** Cloudflare Web Analytics · none · Google Analytics (cookies,
  consent banner).
- **Owner's choice:** Cloudflare Web Analytics.
- **Consequences:** free and cookieless, so no consent banner; its beacon
  script is allowed in each site's security policy; page views, top pages,
  countries and devices per site appear on the website overview once the
  owner's Cloudflare account is connected.

## D-043 — Automated accessibility checks

- **Status:** Confirmed — 2026-10-22 (owner chose to add axe)
- **Proposed:** add `@axe-core/playwright` (MPL 2.0, free) to the browser
  tests of the dashboard and the public sites, failing on serious and
  critical problems in Arabic and English, light and dark. The owner stopped
  its installation once (2026-10-21), so it waits for an explicit choice.

## D-044 — Image processing

- **Status:** Confirmed — 2026-10-22
- **Options:** in the dashboard before upload · Cloudflare Images
  (transformations, paid beyond the free allowance) · no resizing.
- **Owner's choice:** in the dashboard.
- **Consequences:** the browser decodes each photo, resizes it to a few widths
  (phone to large screen), encodes WebP and so drops all camera and location
  data, then uploads only those copies; originals never leave the device.
  The dashboard API checks every file again (type by content, size,
  dimensions) and stores it in the site's private R2 space. Free; the Workers
  free plan's CPU limit rules out resizing on the server anyway. SVG logos are
  sanitised; fonts follow D-033.

## D-045 — General catalogue

- **Status:** Confirmed — 2026-10-22 (owner: "make it general, not just
  switches and sockets")
- **Choice:** the catalogue (D-026) and media library serve any kind of
  product on any website. Categories, attribute definitions, finishes and
  product page layouts are data each website defines; nothing in the code is
  specific to switches or sockets.
- **Consequences:** D-026's wall-plate page layout and switch and socket
  attribute sets become optional *templates* a website can start from, next
  to general ones (e.g. lighting, generic product). Hantex Ultra keeps
  Switches and Sockets as its first, *main* categories as the owner named
  them; another website can lead with entirely different products.

