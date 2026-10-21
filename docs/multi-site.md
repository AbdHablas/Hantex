# Multi-website platform

**Status:** Confirmed by the owner on 2026-10-21, both the requirement and the
design below (D-024). Each site keeps its own product records. Staff roles
are assigned per website (D-025, confirmed), and the hosting design is
proposed in D-028. Nothing in this document is built yet.

## Requirement (owner, 2026-10-21)

The dashboard is a central management platform for **any website the owner
creates**, not only www.hantexultra.com. Each website has its own branding,
design settings, content, products and configuration. The dashboard and the
management system underneath are shared where that makes sense.

## Terms

- **Platform**: the dashboard, its API, the database and the shared services
  (sign-in, publishing, 3D Product Studio, email, monitoring, backups).
- **Site**: one public website, with its own domains, languages, theme,
  content, product catalogue, sign-ups and enquiries. Each site has its own
  mode: Coming Soon, live or maintenance. Hantex Ultra
  (www.hantexultra.com) is the first site.

This is one team managing several websites, the owner and their staff. It is
not software sold to other companies, so there is one set of staff accounts
and one dashboard.

## Shared versus per site

| Shared by all sites (platform) | Separate for each site |
|--------------------------------|------------------------|
| Staff accounts, passkeys, sessions, recovery | Domains, languages (default language and text direction), site mode |
| Role definitions: the permission matrix (D-019) | Which staff work on the site, and in which role (D-025) |
| Font library, design-system components, site templates | Theme: colours, fonts, shape, motion, light/dark behaviour ([`theming.md`](theming.md)) |
| Publishing pipeline and preview signing | Logo, favicon and other brand assets |
| 3D Product Studio engine, providers and budget ([`3d-product-studio.md`](3d-product-studio.md)) | Content: Coming Soon, pages, navigation, site settings, SEO |
| Email sending, monitoring, backups | Product catalogue: categories, series, products, finishes, photos, 3D models ([`product-catalogue.md`](product-catalogue.md)) |
| Audit log (every entry records its site) | Launch sign-ups and enquiries (personal data) |
| | Version history, previews and publishing of all of the above |

## Creating a site (no code changes)

Only the Owner can do this, through a new owner-only permission, *Sites:
create and manage*.

1. Enter the name, a short key (for example `hantex-ultra`), the languages
   and default language, and a template. The first templates are *Product
   showcase* and *Coming Soon*.
2. Pick a starting theme: the Hantex Ultra brand preset, a neutral starter,
   or a copy of another site's theme.
3. Add the domains. They are recorded as *pending* and connected only after
   the owner approves the DNS change (see Hosting below).
4. The site starts in **Coming Soon mode** and stays there until the owner
   switches it live. This is the same rule as for www.hantexultra.com.
5. Assign staff to the site (D-025).

A site can be archived: its public pages are taken down after
confirmation and its data is kept according to the retention policy. Sites
are never deleted silently.

## Working in the dashboard

- A **site switcher** sits at the top of the dashboard. Every page except the
  platform pages works on the selected site. The site's name and logo stay
  visible so staff don't edit the wrong site by mistake.
- Platform pages cover staff accounts, the roles matrix, sites, the font
  library, 3D Studio providers and budget, security, and the audit log across
  all sites.
- Every API address includes the site: `/api/sites/:siteKey/...`. On every
  request the server:
  - loads the site;
  - checks the user's permission **for that site**;
  - filters every database query by that site.

  A record that belongs to another site is answered as "not found".

## Staff access across sites (D-025, confirmed: option A)

- **A. Per site, with an "all sites" option (chosen by the owner).** Each staff
  member gets a role on each site they work on, for example Content Manager
  on Hantex Ultra and Viewer on another site, or one role covering all sites.
  Owners always cover all sites. This is least privilege: staff of one brand
  never see another site's customers.
- **B. One role for all sites.** This is simpler. Everyone sees and edits
  every site within the limits of their role.

How option A works:

- Role definitions stay platform-wide: the six standard roles and any custom
  roles.
- An *assignment* links a person to a role, either for one site or for all
  sites.
  - A person has either one all-sites assignment or per-site assignments,
    never both.
  - Owner assignments are always all-sites.
- Managing staff and viewing the audit log apply only within the sites an
  assignment covers.
- These stay owner-only platform permissions:
  - managing Owners and Administrators;
  - editing roles;
  - security settings;
  - creating sites.
- Nobody can assign roles on a site where they cannot manage staff.
- All the existing safeguards apply per site:
  - nobody can change their own access;
  - nobody can grant what they don't hold;
  - the last Owner is protected;
  - every change is audited and emailed to the Owners.

## Hosting and publishing (D-028, proposed)

- **One code base for all public sites.** `apps/web`, the *site engine*,
  builds one site at a time from that site's published data, for example
  `SITE=hantex-ultra`.
- **Publishing a site rebuilds and deploys only that site.** D-006 is
  unchanged: static pages, with a few minutes' delay after publishing.
- **Each site is its own Cloudflare Worker** (`site-<key>`). It serves the
  site's static pages and its small form endpoints (sign-up, enquiries).
  - Each site gets its own logs, version history and one-click rollback.
  - The Free plan allows 100 Workers per account
    ([Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/)).
- **Photos, 3D models and documents are served from R2 through a media
  domain for each site**, for example `media.hantexultra.com`. They are not
  bundled into the site build. This keeps builds small, keeps each site well
  inside the static-file limits, and means media requests don't use Worker
  requests.
- **Forms** write only to their own site's records. The site comes from the
  Worker's configuration, never from the visitor's request.
- **Domains and DNS** are proposed in the dashboard and applied only by a
  production deployment the owner approves ([`deployment.md`](deployment.md)).
  The dashboard holds no Cloudflare credentials.

## Data model changes (Phase 2)

- New `sites` and `site_domains` tables.
- A site column, and site-aware unique keys, added to:
  - document drafts and versions (Coming Soon, site settings, theme);
  - publish jobs;
  - sign-ups;
  - form rate limits;
  - invitations;
  - audit log entries (empty for platform-wide events).
- `user_roles` (one role per user) becomes `role_assignments` (person, role,
  and one site or all sites), shaped by the D-025 answer.
- No production database exists yet, so the existing migrations are revised
  rather than migrated in place.

## Security

- **Site isolation:** permissions are checked per site on every request.
  Automated tests call every endpoint with every role against another site's
  records.
- **Personal data stays within its site:** sign-ups and enquiries are
  visible only to staff with the right permission on that site, and exports
  are per site.
- **Platform actions are owner-only and audited:** sites, roles, security
  settings and Owner accounts.
- PostgreSQL row-level security, as a second layer under the application's
  checks, is evaluated in Phase 5.

## Limitations

- **Shared dashboard and database.** All sites share one dashboard and one
  database, so an outage affects every site's dashboard. Public sites keep
  serving their static pages.
- **Email sender domain.** Emails are sent from the platform's domain.
  Sending from a site's own domain needs that domain verified with Resend,
  which means DNS records added with the owner's approval. The free plan's
  domain allowance is to be checked.
- **Domains must be on the owner's Cloudflare account** for Workers custom
  domains to work.
- **Cron Triggers.** The Free plan allows 5 per account
  ([Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/)),
  so scheduled jobs (health checks, scheduled publishing) run from one shared
  schedule rather than one per site.
- **New templates and new content block types need development work.**
  Everything else is done in the dashboard: new sites, themes, palettes,
  fonts, logos, categories, attributes, products, and pages built from
  existing blocks.
