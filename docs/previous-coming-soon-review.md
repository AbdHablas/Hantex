# Review — previous Coming Soon project

The owner supplied `hantex-ultra-cloudflare.zip` (2026-10-20): an earlier,
separate Coming Soon page with an admin panel, built as a single Cloudflare
Worker with a D1 database. It was inspected, not run, and is not copied into
this repository (it contains account identifiers and the repository is
public). This review records what it contains so nothing useful is lost.

## What it is

- One Worker serving an Arabic, right-to-left launch page at `/`, an admin
  panel at `/admin`, and a small JSON API.
- D1 database `hantex-ultra-db` (README says it already exists in the
  owner's Cloudflare account) with tables for page content, subscribers,
  daily visit counters and rate limits.
- Not connected to hantexultra.com (the custom-domain routes are commented
  out); it may be running on a `workers.dev` address.

## Features worth keeping (as ideas, subject to approval)

- Countdown to a launch date, with "add to calendar" and "notify me".
- Launch-notification sign-up accepting a WhatsApp number **or** an email,
  with a honeypot field, rate limiting and duplicate handling.
- Contact sheet: phone, WhatsApp, email, Instagram, Facebook, address, map
  link, working hours — empty fields hidden.
- Share button and a live local clock.
- Interactive switch demo (finishes, lighting scenes, brightness).
- Launch readiness bars and a milestone timeline, editable in the admin.
- Admin: content editing with preview and publish, subscriber list with CSV
  export (formula-injection safe) and delete, privacy-friendly visit and
  click counters (no cookies, no IP storage).

## Content found — needs the owner's confirmation before reuse

| Item | Value in the previous project |
|------|-------------------------------|
| Language | Arabic, right-to-left |
| Tagline | تفاصيل تصنع الفرق. جودة تليق بكل مساحة. |
| Footer line | ENGINEERED FOR EVERY DETAIL |
| Launch date | 20 December 2026, 19:00 (UTC+3) |
| Local clock | Damascus |
| Working hours | Saturday–Thursday, 9 am – 6 pm |
| Milestones | identity approved 2026-06-01 · first switch prototypes 2026-09-15 · catalogue 2026-11-15 · official launch 2026-12-20 · showroom opening 2027-01-15 |
| Readiness | brand identity 100 %, product development 82 %, catalogue 60 %, website 35 % |
| Collections | Glass (tempered glass plates), Metal (polished aluminium), Smart (touch switches, phone-controlled scenes) |
| Finishes in the demo | Ice white, Champagne, Graphite |

The brand guidelines' tagline is "Power. Connected." — which line(s) to use
is an open content question.

## Not carried forward

- **Logo and colours:** the inline mark is off-spec (switch shifted, shorter
  connecting bar, no base line) and uses off-palette colours (`#2BD0DF`,
  `#EEF0F3`, `#111317`). The new site uses the official artwork in
  `brand/logo/`.
- **Admin security:** one shared password for everyone, stateless 12-hour
  sessions that cannot be revoked, no per-user accounts, roles, two-factor
  or audit log. Replaced by the confirmed design (passkeys, roles, audit log,
  Cloudflare Access).
- **Headers:** no Content-Security-Policy or HSTS.
- **Fonts:** loaded from Google's servers; the new site self-hosts fonts.
- **Storage:** D1; the new platform uses Neon PostgreSQL (D-003).

## Open questions for the owner

1. ~~Is the previous Worker deployed anywhere?~~ **Answered: never
   deployed, no real subscribers** (D-016).
2. ~~Which of the content items above are confirmed and may be used?~~
   **Answered: none are hard-coded; the owner sets them from the dashboard**
   (D-016).

The existing D1 database is left untouched until the owner decides.
