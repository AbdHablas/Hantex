# Roles and permissions

**Status:** Proposed (D-019) — awaiting the owner's approval. Nothing here is
implemented until it is approved.

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
| Products and catalogue *(Phase 4)* | ✓ | ✓ | ✓ | View | Draft | View |
| Media library: view and upload | ✓ | ✓ | ✓ | View | ✓ | View |
| Media library: delete | ✓ | ✓ | — | — | — | — |
| Permanently delete content | ✓ | ✓ | — | — | — | — |
| Sign-ups and enquiries: view | ✓ | ✓ | — | ✓ | — | — |
| Sign-ups and enquiries: export (CSV) | ✓ | ✓ | — | ✓ | — | — |
| Sign-ups and enquiries: delete (e.g. on request) | ✓ | ✓ | — | — | — | — |
| Site settings (contact details, social links, SEO defaults) | ✓ | ✓ | View | View | — | View |
| Site mode: Coming Soon ↔ live, maintenance | ✓ | — | — | — | — | — |
| Staff: invite and disable Content Manager, Sales, Editor, Viewer | ✓ | ✓ | — | — | — | — |
| Staff: manage Owners and Administrators | ✓ | — | — | — | — | — |
| Roles: create and edit custom roles | ✓ | — | — | — | — | — |
| Audit log: view | ✓ | ✓ | — | — | — | — |
| Security settings (sessions, sign-in policy) | ✓ | — | — | — | — | — |

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

## Custom roles

Phase 2 creates the six roles above. The screen for creating custom roles
from these permissions (Owner only, within the rules above) follows in
Phase 3.
