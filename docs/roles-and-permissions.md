# Roles and permissions

**Status:** Confirmed (D-019, 2026-10-20). The six roles below are the
**standard roles**; the whole matrix is **editable from the dashboard**.

Sized for the owner plus about 2–5 staff (owner's answer, 2026-10-20). Roles
are stored in the database as bundles of permissions, so they can be changed
or extended later without rebuilding anything.

## Roles

| Role | Who it is for |
|------|---------------|
| **Owner** | You. Full control, including staff accounts, roles and taking the site live. At least one Owner must always exist. |
| **Administrator** | A trusted manager who runs the website day to day, without control over Owners, roles or going live. |
| **Content Manager** | Updates and publishes website content, Coming Soon details and (later) products and news. |
| **Sales & Enquiries** | Follows up launch sign-ups and (later) enquiries and quotation requests. Sees customer contact details; does not edit the website. |
| **Editor** | Prepares drafts and uploads images; someone else publishes. |
| **Viewer** | Read-only access to content and statistics; never sees customer personal data. |

## Matrix

✓ = allowed · **Draft** = create and edit drafts only (no publish or delete)
· **View** = read only · — = no access

| Area | Owner | Administrator | Content Manager | Sales & Enquiries | Editor | Viewer |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard overview and statistics (aggregate, no personal data) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Coming Soon content (launch date, texts, milestones…) | ✓ | ✓ | ✓ | View | Draft | View |
| Publish changes (rebuilds the public page) | ✓ | ✓ | ✓ | — | — | — |
| Pages, news, FAQs *(Phase 3+)* | ✓ | ✓ | ✓ | View | Draft | View |
| Products and catalogue *(Phase 3)* | ✓ | ✓ | ✓ | View | Draft | View |
| 3D Studio: create and review models *(Phase 3, D-029)* | ✓ | ✓ | ✓ | — | Create only | View |
| 3D Studio: approve models for publishing *(owner's requirement)* | ✓ | — | — | — | — | — |
| Media library: view and upload | ✓ | ✓ | ✓ | View | ✓ | View |
| Media library: delete | ✓ | ✓ | — | — | — | — |
| Permanently delete content | ✓ | ✓ | — | — | — | — |
| Sign-ups and enquiries: view | ✓ | ✓ | — | ✓ | — | — |
| Sign-ups and enquiries: export (CSV) | ✓ | ✓ | — | ✓ | — | — |
| Sign-ups and enquiries: delete (e.g. on request) | ✓ | ✓ | — | — | — | — |
| Site settings (contact details, social links, SEO defaults) | ✓ | ✓ | View | View | — | View |
| Appearance: edit theme drafts *(D-022)* | ✓ | ✓ | — | — | — | — |
| Appearance: publish or roll back the theme *(D-022)* | ✓ | ✓ | — | — | — | — |
| Appearance: edit logo colours (departs from brand guidelines) *(D-022)* | ✓ | — | — | — | — | — |
| Site mode: Coming Soon ↔ live, maintenance | ✓ | — | — | — | — | — |
| Staff: invite and disable Content Manager, Sales, Editor, Viewer | ✓ | ✓ | — | — | — | — |
| Staff: manage Owners and Administrators | ✓ | — | — | — | — | — |
| Roles: create and edit custom roles | ✓ | — | — | — | — | — |
| Audit log: view | ✓ | ✓ | — | — | — | — |
| Security settings (sessions, sign-in policy) | ✓ | — | — | — | — | — |
| Sites: create and manage websites (domains, languages, archiving) *(D-024)* | ✓ | — | — | — | — | — |

## Rules that always apply

- Every action is checked on the server, on every request. Hidden buttons are
  only a convenience, never the protection.
- Nobody can change their own role or permissions.
- Nobody can grant a permission they do not hold themselves.
- The last remaining Owner cannot be removed, disabled or demoted.
- Owners are notified by email when any role or staff account changes.
- Sign-ins, role and account changes, publishing, exports and deletions are
  written to the audit log, which cannot be edited from the dashboard.
- Destructive actions ask for confirmation in the dashboard.
- Infrastructure settings (secrets, database, Cloudflare, email keys) are
  never editable from the dashboard — they live in Cloudflare and CI
  configuration only.

## First Owner account

No administrator account is built into the code. The first Owner is created
with a single-use, time-limited setup invitation generated during
deployment; it is stored only as a hash, expires within 24 hours, and the
setup route stops working as soon as an Owner exists. The Owner's email is
also added to the Cloudflare Access policy in front of the dashboard.

A second Owner (a trusted person) is recommended later so that access can be
recovered if one Owner loses all their devices.

## Dynamic matrix (owner's requirement)

The matrix is managed from the dashboard, not fixed in code:

- **Roles are data.** The six roles above are created as the standard set.
  The Owner can edit which permissions each role has, create new roles
  (from scratch or by copying a standard one), rename them, and delete
  custom roles that no one is assigned to.
- **Permissions are defined in code.** Each permission matches a check the
  server performs (for example "publish Coming Soon content" or "export
  sign-ups"), so new permissions arrive with new features; the dashboard
  assigns them to roles but cannot invent permissions the server does not
  enforce.
- **The Owner role is locked** to all permissions, so the site can never be
  left without someone able to manage it.
- **Owner-only permissions** — managing Owners and Administrators, editing
  roles, site mode (Coming Soon ↔ live), security settings — can only ever be
  held by the Owner role; the matrix shows them greyed out for other roles.
- **Reset to standard** restores any of the five editable standard roles to
  the permissions in the table above.
- **Changes take effect immediately** — permissions are checked against the
  current matrix on every request.
- **Every change is audited** (who, when, before and after) and emailed to
  all Owners. Sensitive permissions (customer personal data, export,
  delete) are labelled as such in the matrix, and changes that affect
  people already assigned to a role ask for confirmation.
- The rules above (no self-changes, no granting what you do not hold, last
  Owner protected) apply to the matrix too.

The matrix editor is part of the Phase 2 dashboard foundation.

## Several websites (D-024; per-site roles confirmed, D-025)

The dashboard now manages any number of websites ([`multi-site.md`](multi-site.md)).
Role definitions (the matrix above) stay shared by all sites. The owner
chose option A for **where a role applies** (2026-10-21):

- **A. Per site, with an "all sites" option (chosen).**
  - A person's role is assigned for one site, or for all sites.
  - Owners always cover all sites.
  - *Staff* and *Audit log* rows apply within the sites the assignment
    covers.
  - Owner-only rows stay platform-wide: managing Owners and Administrators,
    roles, security settings, and the new *Sites: create and manage*.
- **B. One role for all sites,** as the matrix works today.

Either way, the rules above (no self-changes, no granting what you don't
hold, last Owner protected, audited and emailed changes) apply on every
site.

**Built (2026-10-21):** each permission in code is marked *site* or
*platform*. Platform permissions (managing Owners and Administrators, roles,
security settings, sites) count only from an all-sites assignment, so a
per-site role can never act on the whole platform, even if a custom role
lists them. `@hantex/shared` works out a person's permissions on each site,
and the database rejects per-site Owners and mixed all-sites and per-site
assignments.

## Permissions planned for later features

These are added to the matrix as each feature is built. Each one is proposed
with its standard-role defaults before it is used:

- Font library: add and remove fonts.
- Catalogue: view, edit drafts, publish, delete
  ([`product-catalogue.md`](product-catalogue.md)).
- Media: view and upload, delete.
- 3D Studio:
  - create captures and start processing;
  - review;
  - approve models for publishing;
  - manage providers and budget (Owner only)
  ([`3d-product-studio.md`](3d-product-studio.md)).
- Enquiries: view, export, delete.
