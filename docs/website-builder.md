# Website builder and multi-website management

How the dashboard lets the owner create and run several independent websites
without code: pages, sections, menus, branding, content and publishing.
Status: **confirmed** (D-035 to D-039, 2026-10-22). Progress: Phase 3a core done:
section registry, builder API, site engine, and the dashboard's Pages, page
editor (device preview, rich text, drag and drop), Menus and New website
screens. Remaining in 3a: saved global sections and a version-history screen
for pages (see the [implementation plan](implementation-plan.md)).

## Requirement (owner, 2026-10-21)

Create, customise, publish and manage several independent websites from one
dashboard; Hantex Ultra (switches and sockets first; lamps, lighting and
accessories) is the first, not the only one. Pages, sections, menus, design
and content are managed visually, previewed on desktop, tablet and mobile,
and published without code. Changes to one website never affect another.

**Definition of done:** two or more websites created from the same dashboard,
each customised independently: pages and sections added and removed, menus
and branding changed, content managed, responsive layouts previewed, changes
published, without writing code or affecting the other websites.

## What already exists (reused, not rebuilt)

| Capability | Where | Decision |
|------------|-------|----------|
| Website registry with a stable key, names, languages, mode, template, archive | `sites`, Websites page | D-024 |
| Domains recorded per site; connected only by an approved deployment | `site_domains` | D-024, D-028 |
| Roles per website or for all websites; a site you can't open looks like it doesn't exist | `role_assignments`, `withSite` | D-025 |
| Content stored per site as documents with drafts, numbered versions, rollback and audit | `document_drafts`, `document_versions` | D-006 |
| Signed draft previews on the site's own address | `/preview` | D-006 |
| One site engine built per site from its published data, one Worker per site | `apps/web`, `publish.yml` | D-028 |
| Theme per site: colours, light/dark, typography, presets, copy from another site | Appearance | D-022, D-027, D-031, D-032 |

One platform, one dashboard, one site engine: a new website is a new record and
its own build, never a new application.

## Architecture (proposed)

```
Dashboard (React)                      API (Worker)                    Site engine (Astro, built per site)
  Website switcher                       site-scoped routes             reads the site's published:
  Pages ─ page editor ─ sections ─┐      validates every document        pages → routes
  Menus                           ├────► against the section registry ──► menus → header, footer, mobile
  Design (theme)                  │      versions + audit                theme → CSS variables
  Media, products (Phase 3b/3c)   │                                      sections → registry renderers
  Device preview (iframe) ◄───────┘ signed preview ◄──────────────────── /preview renders the draft
```

1. **Section registry** (`packages/sections`, new). Every section type is
   defined once: an id, a Zod schema for its settings (bilingual text fields,
   links, colours from theme tokens, spacing from a fixed scale, visibility per
   device), defaults, an Astro renderer for the sites and a settings form for
   the dashboard. Pages store only `{ type, settings }` data, validated on
   save and before publishing. There is no free HTML, CSS or script anywhere.
2. **Pages** are site documents: title, slug, SEO and sharing fields,
   visibility (published, hidden, unpublished), template, parent page, and an
   ordered list of sections. The home page is a flag on one page.
3. **Global sections** (header, footer, announcement bar, and any section
   saved as "global") are stored once per site and referenced by pages, so
   editing one updates every page of that site, and only that site.
4. **Menus** are site documents (header, footer, mobile, secondary): items
   link to a page, a category, a product, an external address or a custom
   path; one level of dropdowns, and mega-menu columns for the header.
5. **Publishing**: everything is saved as drafts; *Publish changes* validates
   all changed items (required fields, links to unpublished pages, duplicate
   slugs, contrast and readability), records new versions and starts one
   rebuild of that site. Rollback restores earlier versions. Slug changes and
   unpublished pages produce redirects (`_redirects`, served free by the
   site's static assets) so shared links keep working.
6. **Device preview**: the page editor shows the real site, rendered from the
   draft, in a frame at phone, tablet and desktop widths, updated as settings
   change. Section settings that can differ by device (visibility, columns,
   alignment, spacing) default to sensible values so nothing has to be set
   three times.
7. **Templates**: platform templates (page layouts and whole-site starter
   kits) are copied into a site when used; later template changes never
   change existing sites. A website can also be duplicated from another one.
8. **Isolation**: every page, menu, section, media file and product carries
   the site's id; every API route already runs inside the site context and
   checks the person's role on that site; builds read one site's data only.

## Minimum viable builder (proves a second, genuinely independent website)

**Essential (Phase 3a):**

- Guided *New website* flow: name and languages → template or duplicate an
  existing site → theme preset → home page created → open the page editor.
- Duplicate a website (pages, menus, theme, settings; never sign-ups, staff
  or audit history).
- Pages: create, rename, duplicate, reorder, hide/show, publish/unpublish,
  delete (with confirmation), slug, SEO title and description, home page.
- Section editor: add, remove, reorder (drag and drop, and keyboard), duplicate,
  hide/show per device, edit settings; live device preview.
- Sections without media: hero (text and colours), rich text, features, call
  to action, FAQ, statistics, contact details, newsletter sign-up, category
  list from site content, spacer/divider.
- Menus: header and footer, links to pages and external addresses, one level
  of dropdowns, reorder, hide.
- Publish changes with validation, redirects for changed slugs, rollback.
- Site engine renders pages, menus and sections; the Coming Soon page stays a
  site mode, and the built pages go public only when the owner switches the
  site to live.

**Advanced (later phases):**

- Media library on R2, logo upload, images, galleries, video, sharing images
  (Phase 3b).
- Product catalogue, product grids, featured collections, carousels,
  specification and comparison tables, product pages, 3D showcases
  (Phase 3c, 4).
- Mega menus, secondary and mobile-only menus, section presets library,
  per-page access rules, scheduled publishing, currencies.
- Basic performance figures per website (from Cloudflare Web Analytics if
  approved).

## Acceptance criteria (automated tests)

- **Isolation:** a page, menu or section saved on site A is never readable,
  writable or published through site B's address, for any role.
- **Permissions:** each new action (pages, menus, publish) is checked per
  role in the access-matrix test.
- **Validation:** unknown section types, settings outside their schema,
  duplicate slugs, links to deleted pages and unreadable text are refused.
- **Publishing:** publishing site A rebuilds only site A; rollback restores
  the previous pages and menus; a changed slug redirects.
- **Builder workflow (browser test):** create a second website from a
  template, add a page, add and reorder sections, add it to the header menu,
  preview at phone and desktop widths, publish; the first website is
  unchanged.
- **Responsive:** every section renders without sideways scrolling at 360,
  768, 1024 and 1440 px in Arabic and English, light and dark.
