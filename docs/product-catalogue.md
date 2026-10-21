# Product catalogue: switches and sockets first

**Status:** Confirmed by the owner on 2026-10-21, both the requirement and the
structure below (D-026). No prices or online ordering. The dashboard side is built in Phase 3
and the public pages in Phase 4. Nothing is built yet.

## Business context

Hantex Ultra is a brand specialising in electrical switches, sockets,
lighting, lamps and related accessories. **Switches and sockets are the main categories**: they lead the
catalogue's structure, navigation, categorisation and presentation. Each
website has its own catalogue ([`multi-site.md`](multi-site.md)), so other
websites get their own categories and products in the same system.

**No product facts are invented.** Every name, specification, finish,
certification and document comes from the owner's team through the
dashboard. Until something is entered, the website shows nothing for it.

## Structure

| Level | What it is |
|-------|------------|
| Category | Ordered tree, up to three levels. A category can be marked *main*, which puts it first in menus and on the home page. |
| Series | A design line: products that share one design and one set of finishes. Each series has its own showcase page. |
| Product | One functional item, such as a particular switch or socket type. It has one primary category, optional extra categories and an optional series. |
| Variant | One version of a product, usually in a particular finish. It has its own code (SKU), photos and 3D model. |
| Finish | A colour or material, defined once and reused: name in each language, swatch, material type, and 3D material settings that are checked against photos. |
| Attributes | Typed fields defined in the dashboard for each category: text, number with unit, choice, or yes/no. Grouped (electrical, dimensions, materials, compliance), optionally filterable and shown in the specification table. |
| Documents | Datasheets, installation guides and certificates (PDF), attached to a product or a series. |
| Media | Photos by view (front, side, rear, detail, in use) and 3D models from the Studio. The same photo set serves the product gallery and the 3D capture. |

**Starting categories for Hantex Ultra** are the five the owner named:

- Switches and Sockets, marked *main* and placed first;
- Lighting, Lamps and Accessories after them.

Sub-categories, series, attributes and finishes are created by the owner's
team.

## Switches and sockets first

- **Navigation:** the main categories lead the menu, the home page and
  search. Their menus show sub-categories and series. Ranking is stored as
  data, so a site for a different business can put other categories first.
- **Page templates designed around wall plates:**
  - finish selector;
  - straight-on hero view of the plate;
  - module and gang layout;
  - a slot for the dimension drawing;
  - installation documents;
  - "view on your wall" in augmented reality, offered only when a true-scale
    model exists ([`3d-product-studio.md`](3d-product-studio.md)).
- **Starter attribute templates for switches and sockets.** These are
  suggested *field definitions* only. The values are entered by the owner's
  team, and the fields can be renamed or removed:
  - number of gangs;
  - ways (switching);
  - rated current and voltage;
  - mechanism type;
  - socket standard;
  - shutters;
  - USB or other outlets;
  - dimensions;
  - IP rating;
  - materials and finish.
- **Lamps and lighting** use the same structure with their own starter
  fields:
  - power;
  - luminous flux;
  - colour temperature;
  - colour rendering;
  - base or fitting;
  - dimmable;
  - beam angle;
  - IP rating;
  - dimensions.

## Product and series pages (Apple-style)

- Pages are built from blocks managed in the dashboard:
  - a full-width hero showing the 3D model or a photo;
  - scroll-linked feature sections;
  - finish selector;
  - highlights;
  - specification table generated from the attributes;
  - downloads;
  - related products from the same series;
  - an enquiry button.
- The interactive 3D viewer (rotate, zoom) loads only when it is needed. A
  poster image shows first, and remains on devices and connections that
  can't display 3D.
- Motion respects the visitor's reduced-motion setting. Text and controls
  meet WCAG AA. Arabic right-to-left comes first, with English alongside.
- Pages are static: no database query when someone views a page (D-006).
  Filters and search run in the browser from indexes generated at build
  time, so they cost nothing per visit. Search uses Pagefind (MIT licence),
  and its Arabic support is to be checked.
- Structured data for search engines (schema.org `Product`) is generated
  only from facts that have been entered.

## Rules

- **Each site owns its products.** Every product belongs to one site.
  *Copy to another site* duplicates a product and reuses its stored photos and
  3D files rather than uploading them again. A catalogue shared between
  sites of the same brand can be added later without restructuring.
- **Translations:** every text field is entered in each of the site's
  languages. A language can't be published while required fields are missing
  in it.
- **Workflow:** draft, then review, then publish (as part of publishing the
  site), with versions and rollback. Every step is permission-checked and
  audited.
- **Certifications and compliance marks** appear only when a supporting
  document is attached and an Owner or Administrator has marked it verified.
- **Bulk entry:** products and variants can be imported and exported as
  CSV/Excel, with the same validation as the forms.

## New permissions (per site, planned)

They are added to the roles matrix ([`roles-and-permissions.md`](roles-and-permissions.md))
as each feature is built:

- **Catalogue:** view; edit drafts; publish; delete.
- **Media:** view and upload; delete.
- **3D Studio:**
  - create captures and start processing;
  - review results;
  - approve models for publishing;
  - manage providers and budget (Owner only).
- **Enquiries:** view; export; delete.

## Out of scope unless decided later

These are not planned. Each would be a separate decision:

- prices, stock and online ordering;
- a distributor or trade portal;
- connections to an ERP or other product-information system.
