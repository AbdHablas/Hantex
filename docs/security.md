# Security

**Status:** planned controls from the confirmed decisions. Nothing is
implemented yet; this document will record what was actually built and
tested. No system is completely secure — remaining risks are listed at the
end.

## What we protect

- Staff accounts and the dashboard (content integrity, site mode).
- Customer personal data: launch sign-ups (email or WhatsApp number) and,
  later, enquiries, for every website the platform manages.
- Unreleased product information: product photos, 3D models, CAD files and
  specifications are commercially sensitive until published.
- Availability and reputation of www.hantexultra.com and every other site.
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

### Several websites (D-024, confirmed)

- **Every request is checked against its site.** Every dashboard API address
  includes the site. The server checks the user's permission for that site
  and filters every query by it. Records of another site are answered as
  "not found".
- **Tests try to cross sites.** Automated tests call every endpoint with
  every role against another site's records.
- **Personal data never crosses sites.** Sign-ups, enquiries and exports
  belong to one site.
- **Public form endpoints take the site from their own configuration**,
  never from the request.
- **Platform actions are owner-only and audited:** sites, roles, security
  and Owner accounts.
- PostgreSQL row-level security as a second layer is evaluated in Phase 5
  ([`multi-site.md`](multi-site.md)).
- **Built and tested (2026-10-21):** the dashboard API's site routes
  (`/api/sites/:siteKey/...`) are tested with every standard role on two
  sites. A site the person doesn't cover answers "not found"; a missing
  permission answers "forbidden". Expected results come from the approved
  role table, not from the code under test. The tests connect as the
  dashboard's least-privilege database user, so the grants are tested too.
- **Account-wide actions need an all-sites role.** Disabling or re-enabling
  an account affects every site the person works on, so a per-site
  Administrator can't do it. They can remove the person's access to their
  own site instead.
- **The dashboard Worker has no `workers.dev` or preview address**
  (`workers_dev: false`, `preview_urls: false`). It is reachable only on its
  own domain, behind Cloudflare Access, once the owner approves deployment.

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

- **Accepted files:** an allow-list of types and sizes, checked by content,
  not just by extension. Files are stored under random keys in R2 and served
  with safe content types.
- **Uploads go straight to private storage.** They use short-lived, signed,
  single-object upload links and never pass through a public bucket.
- **Photos:** location and other metadata (EXIF/GPS) are removed. Image
  dimensions are limited, to protect against decompression bombs.
- **SVG:** parsed and rebuilt from an allow-list. Scripts, event handlers,
  links, `foreignObject`, external references and CSS `url()` are removed.
  The original is kept privately and never served
  ([`theming.md`](theming.md)).
- **Fonts:** parsed before acceptance, size-limited, licence recorded.
- **3D models:** checked with the Khronos glTF validator. They must have no
  external references and stay within size, triangle and texture limits.
  Other formats are converted on the processing runner, never in the
  dashboard Worker.

### 3D Product Studio (D-029, confirmed)

- **Private by default.** Original photos, CAD files, intermediate files and
  unapproved models live in a private R2 bucket. Only approved, optimised
  outputs are copied to the public media bucket, and only when the site is
  published.
- **Never published automatically.** Publishing needs an approved model and
  a person with the publish permission. Approval and publishing are separate
  permissions, and both are audited.
- **Third-party AI services see product photos.** Each provider's data
  policy is recorded before it can be enabled: does it train on uploads, how
  long does it keep them, can it be opted out. The Owner must approve each
  provider (D-005).
  - The dashboard shows which provider a capture will be sent to before
    sending.
  - Providers that train on uploads without an opt-out are not recommended
    for unreleased products.
- **The processing runner gets only what each job needs:**
  - storage credentials limited to the Studio bucket;
  - job callbacks signed with a shared secret;
  - no database credentials.

  It runs where its logs are private. Logs and artifacts of workflows in
  this public repository are visible to anyone
  ([`3d-product-studio.md`](3d-product-studio.md)).
- **Honest labels.** AI-generated geometry or imagery is never labelled as a
  measured 3D reconstruction. "View on your wall" (true scale) is offered
  only when the model's size matches the entered dimensions.

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
- **Latest stable releases (D-023).** pnpm 12 brings safer defaults, which
  we keep as they are:
  - packages are installed only once they have been published for at least
    a day (`minimumReleaseAge`), which avoids freshly hijacked releases;
  - only packages on the `allowBuilds` list may run install scripts;
  - exotic sub-dependencies (from Git or URLs) are blocked.

### Not exposed in production

- No debug, test or seed routes in production builds; unfinished pages are
  not built into the public site; preview environments sit behind
  Cloudflare Access; robots rules and `noindex` on anything not public.

## Testing

In place (run in CI on every push):

- unit tests for validation, permission and assignment logic;
- database tests for constraints, triggers and each database user's grants;
- dashboard API tests: every site endpoint × every standard role × two
  sites, cross-site isolation, staff escalation rules, invitations, account
  recovery, the same-origin check, disabled accounts and archived sites.

Planned: end-to-end tests of passkey sign-in, publishing and sign-up in a
real browser; header and caching checks against a deployed staging Worker;
an automated penetration test (Strix) against staging in Phase 5.

## Known remaining risks

- Account recovery depends on the staff member's email account; mitigated by
  recovery codes, Cloudflare Access, audit log and Owner notifications.
- Free-plan limits: fewer Cloudflare firewall and rate-limiting rules than
  paid plans; a large automated attack could exhaust free quotas.
- Single database region (Neon); recovery relies on Neon restore and the
  nightly backups (D-010).
- The repository is public: the code is visible, so security must never rely
  on obscurity (it does not). Workflow logs and artifacts are public too, so
  no job in this repository may handle product photos, personal data or
  secrets in its output.
- Third-party 3D and AI services receive the photos sent to them; their data
  policies can change. Mitigated by owner approval per provider, recorded
  policies and the option to use local or self-run processing only.
