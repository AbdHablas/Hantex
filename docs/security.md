# Security

**Status:** planned controls from the confirmed decisions. Nothing is
implemented yet; this document will record what was actually built and
tested. No system is completely secure — remaining risks are listed at the
end.

## What we protect

- Staff accounts and the dashboard (content integrity, site mode).
- Customer personal data: launch sign-ups (email or WhatsApp number) and,
  later, enquiries.
- Availability and reputation of www.hantexultra.com.
- Secrets: database credentials, API keys, signing secrets.

## Controls by area

### Sign-in and sessions (D-007)

- Passkeys (WebAuthn) through Better Auth; no passwords exist to steal or
  reuse.
- Invite-only accounts; no public sign-up route.
- New devices and recovery: emailed one-time code plus a single-use recovery
  code; last-resort reset by an Owner, audited.
- Sessions stored in the database, revocable; revoked when a user is
  disabled or their role changes. Cookies `HttpOnly`, `Secure`,
  `SameSite=Strict`, scoped to the dashboard host.
- Rate limits on every sign-in route, stored in the database (works across
  Workers instances); Turnstile on sign-in.
- Cloudflare Access in front of the whole dashboard host as a second,
  independent lock.

### Authorisation (D-019)

- Deny by default; every API route declares the permission it needs and Hono
  middleware checks it against the current role matrix on every request.
- Protections against privilege escalation: no self-changes, no granting
  permissions one does not hold, owner-only permissions, last Owner
  protected.
- Object-level checks for records (no access by guessing IDs).
- Automated tests call every endpoint as every role, including direct API
  calls without the dashboard.

### Input, output and injection

- Every input validated on the server with shared Zod schemas; unknown
  fields rejected; size limits on bodies.
- Database access only through Drizzle's parameterised queries.
- Separate database users with least privilege (`packages/db/sql/grants.sql`,
  tested): the dashboard cannot edit or delete audit entries or published
  versions and cannot create sign-ups; the build user reads published
  content only; the backup user is read-only.
- Astro and React escape output by default; rich text is stored as
  structured JSON and rendered from an allow-list — never raw HTML.
- Exports protect against spreadsheet formula injection.

### Browser and HTTP

- Strict Content-Security-Policy (no inline scripts except hashed ones;
  Turnstile allowed explicitly), `frame-ancestors 'none'`, HSTS,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  Cross-Origin-Opener-Policy.
- State-changing requests require the same origin (Origin header check) in
  addition to `SameSite` cookies.
- Dashboard and API responses are `Cache-Control: no-store` and never cached
  by Cloudflare; only public static pages and assets are cached.

### Public forms (D-018)

- Turnstile, per-IP and global rate limits, honeypot field.
- Consent checkbox and privacy note; consent text version stored with each
  sign-up.
- Duplicate sign-ups answered identically to new ones (no way to probe who
  has signed up).
- The public site's database user can only insert submissions — it cannot
  read them. *Implemented in `packages/db/sql/grants.sql` and tested by
  connecting as that user.*

### Appearance editor (D-022)

- Theme tokens validated on the server (format and range); text contrast
  checked against WCAG AA in light and dark mode before publishing.
- No free-form CSS or script fields; fonts only from the curated,
  self-hosted library.
- Publishing and rollback are permission-checked and audited; the dashboard
  keeps its own fixed theme so a broken public theme cannot lock staff out.

### File uploads (Phase 3)

- Allow-list of types and sizes, checked by content not just extension;
  random storage keys in R2; served with safe content types; no
  user-uploaded SVG unless sanitised.

### Secrets and configuration

- Secrets only in Cloudflare (Worker secrets) and GitHub Actions encrypted
  secrets; never in the repository, documentation or frontend bundles.
  `.env` files are git-ignored and `.env.example` holds placeholders only.
- Infrastructure settings are not editable from the dashboard.
- Separate development, preview and production environments and databases.

### Logging and personal data

- No passwords (none exist), tokens, codes or full personal data in logs.
- IP addresses used only for rate limiting, with short retention.
- Subscriber data: view, export and delete are permission-checked and
  audited; retention period to be decided before launch.

### Supply chain

- Lockfile committed; dependencies pinned; automated update pull requests;
  vulnerability scanning in CI; GitHub Actions pinned to commit SHAs; CI
  tokens scoped to the minimum.

### Not exposed in production

- No debug, test or seed routes in production builds; unfinished pages are
  not built into the public site; preview environments sit behind
  Cloudflare Access; robots rules and `noindex` on anything not public.

## Testing (planned)

Unit and integration tests for validation and permission logic; API tests
for every endpoint and role; end-to-end tests of sign-in, publish and
sign-up flows; header and caching checks; dependency scans in CI; an
automated penetration test (Strix) against staging in Phase 5.

## Known remaining risks

- Account recovery depends on the staff member's email account; mitigated by
  recovery codes, Cloudflare Access, audit log and Owner notifications.
- Free-plan limits: fewer Cloudflare firewall and rate-limiting rules than
  paid plans; a large automated attack could exhaust free quotas.
- Single database region (Neon); recovery relies on Neon restore and the
  nightly backups (D-010).
- The repository is public: the code is visible, so security must never rely
  on obscurity (it does not).
