# Implementation plan and checklist

Phases follow the project brief. A phase starts only after the previous one is
approved by the project owner.

**Legend:** [x] done · [ ] pending · [!] blocked

## Requirements update, 2026-10-21

The owner added these requirements before development continues. They are
reflected in this plan and in the documents listed.

| Requirement | Decision | Document |
|-------------|----------|----------|
| The dashboard manages any website the owner creates, each with its own branding, design, content, products and configuration | D-024 (confirmed), D-025 (confirmed: per site), D-028 (confirmed) | [`multi-site.md`](multi-site.md) |
| Product-focused catalogue: switches and sockets first; lighting, lamps, accessories | D-026 (confirmed) | [`product-catalogue.md`](product-catalogue.md) |
| SVG design system with light/dark and adaptable colours per site; central customisation without code; new sites, brands, themes, fonts and palettes without rebuilding | D-027 (confirmed) | [`theming.md`](theming.md) |
| Latest versions of every platform | D-023 (confirmed) | [`development.md`](development.md) |
| AI 3D Product Studio | D-029 (approach proposed), D-030 (confirmed: free photogrammetry, no paid AI) | [`3d-product-studio.md`](3d-product-studio.md) |

## Phase 1: Discovery and architecture *(complete)*

- [x] Repository created and push access confirmed
- [x] Development tooling configured (D-001, D-002)
- [x] Frontend and backend stack (D-003)
- [x] Public website framework: Astro (D-004)
- [x] Cost principle: lowest cost (D-005)
- [x] Rendering strategy: static pages rebuilt on publish (D-006)
- [x] Database and data access layer: Neon PostgreSQL via Hyperdrive, Drizzle (D-003)
- [x] Staff sign-in method: passkeys, Workers Free (D-007)
- [x] Cloudflare account, plan and domain: Free plan, domain active on Cloudflare (D-008)
- [x] File storage: Cloudflare R2 (D-003)
- [x] Email sending: Resend (D-009)
- [x] Testing tools: Vitest 5, Playwright, axe, Lighthouse (D-003)
- [x] Database backups: Neon restore plus nightly encrypted exports to R2 (D-010)
- [x] Monitoring: Cloudflare logs plus email alerts (D-011)
- [x] Brand reference analysed: `docs/brand-guidelines.md`, icon mark SVGs in `brand/logo/` (D-012)
- [x] Brand typeface: Poppins (D-013)
- [x] Website languages: Arabic (default, RTL) and English (D-014)
- [x] Arabic typeface: Readex Pro (D-015)
- [x] Previous Coming Soon project: never deployed; content set from the dashboard (D-016)
- [x] Dashboard foundation delivered with the Coming Soon page (D-017)
- [x] Launch-notification sign-up: email or WhatsApp (D-018)
- [x] Roles and permission matrix: six standard roles, dynamic matrix (D-019)
- [x] Logo update applied (D-020)
- [x] Light/dark for every design, central appearance system (D-021, D-022)
- [x] `docs/architecture.md` started from confirmed decisions
- [x] `docs/security.md`, `docs/deployment.md` written from confirmed decisions

## Phase 2: Coming Soon page and multi-site dashboard foundation *(in progress; approved 2026-10-21; scope extended by D-024)*

Done:

- [x] Design tokens with light and dark values, contrast validation, theme → CSS (`packages/theme`, D-021)
- [x] Repository scaffolding: workspace, TypeScript, ESLint, Prettier, Vitest, local PostgreSQL, CI
- [x] Database schema for a single site: migrations, standard-role seed and least-privilege database users (`packages/db`, tested). Revised for sites below.
- [x] Plan updated for the 2026-10-21 requirements (D-023 to D-030)
- [x] Unfinished dashboard API work kept on branch `wip/dashboard-api`: type-checks, but untested and single-site

Next:

- [x] Staff access across websites: roles per site, with an "all sites" option (D-025)
- [x] Owner's answers on 3D inputs (D-030): no CAD, own capture hardware, free methods only
- [x] Multi-site design approved (D-024)
- [x] Catalogue structure approved (D-026)
- [x] Design system approved (D-027)
- [x] Hosting approved: one Worker per site (D-028)
- [ ] Approval of D-029
- [ ] Toolchain on the latest versions (D-023): Node.js 26, pnpm 12, PostgreSQL 18, patch updates
- [ ] Database made site-aware (D-024, D-025):
  - sites and site domains;
  - site-scoped documents, versions, publish jobs, sign-ups, rate limits and audit;
  - role assignments.
- [ ] Dashboard API (parked work adapted to site-scoped routes):
  - passkey sign-in, invitations and recovery;
  - sessions;
  - tests for every endpoint × role × site.
- [ ] Sites management (Owner): create a site, languages, template, theme preset, domains (pending until approved), mode
- [ ] Roles: standard roles, dynamic matrix editor, assignments per D-025, audit log
- [ ] Coming Soon settings per site (Arabic and English for Hantex Ultra), with Publish rebuilding that site
- [ ] Appearance editor per site (D-022, D-027):
  - colours, fonts, shape, motion, mode and logo colours;
  - presets;
  - preview, publish and rollback.
- [ ] Dashboard app (React): site switcher, the screens above, accessible light/dark interface
- [ ] Site engine (`apps/web`):
  - builds any site, with the Coming Soon template and Hantex Ultra first;
  - tested on desktop, tablet and mobile, in light and dark, RTL and LTR.
- [ ] Launch-notification sign-up per site (email or WhatsApp), with consent, Turnstile and rate limits
- [ ] SEO and social metadata for the Coming Soon state
- [ ] Cloudflare deployment prepared for `hantex-admin` and `site-hantex-ultra`. Nothing is deployed without approval.
- [ ] Phase 2 report and owner approval to continue

## Phase 3: Content, catalogue, media and 3D Studio foundation (dashboard)

- [ ] Media library on R2:
  - private uploads with signed links;
  - image processing and metadata removal;
  - SVG sanitiser;
  - font library uploads;
  - logo upload with colour mapping (D-027).
- [ ] Product catalogue (D-026):
  - categories, with switches and sockets first;
  - series, products, variants and finishes;
  - attributes and documents;
  - CSV/Excel import and export.
- [ ] Pages and navigation built from blocks; news and FAQs if wanted
- [ ] Enquiries and quotation requests per site
- [ ] 3D Product Studio, stage 1 (D-029):
  - captures and capture checks;
  - provider interface;
  - CAD and finished-model import;
  - private processing runner;
  - optimisation, validation and poster images;
  - review, approval and budget controls.
- [ ] Scheduled publishing
- [ ] Owner approval

## Phase 4: Complete public websites

- [ ] *Product showcase* template:
  - home page;
  - category pages with filters;
  - series and product pages built from Apple-style blocks;
  - search (Pagefind);
  - enquiry forms.
- [ ] 3D on product pages: viewer with poster fallback, finish variants, and "view on your wall" for true-scale models (D-029)
- [ ] 3D Product Studio, stage 2:
  - automated photo reconstruction (photogrammetry);
  - optional AI providers, only if the owner approves them (D-030).
- [ ] SEO:
  - sitemaps, `hreflang`, and structured data from entered facts only;
  - performance budgets and accessibility checks.
- [ ] Owner approval

## Phase 5: Testing and hardening

- [ ] Security and permission tests:
  - cross-site isolation;
  - every endpoint as every role;
  - upload and SVG sanitiser tests;
  - 3D Studio security review;
  - Strix penetration test against staging.
- [ ] Quality and recovery:
  - Lighthouse and axe budgets;
  - a backup restore test;
  - evaluation of PostgreSQL row-level security.
- [ ] Owner approval

## Phase 6: Production deployment

- [ ] The owner approves each DNS change and each site's launch. Hantex Ultra leaves Coming Soon only on the owner's approval.
- [ ] Monitoring and alerts live; rollback rehearsed

## AI 3D Product Studio: services, costs, storage and limitations (summary)

Full evaluation and sources: [`3d-product-studio.md`](3d-product-studio.md).

| Need | Service | Cost, checked 2026-10-21 |
|------|---------|--------------------------|
| Storage of originals, models and previews | Cloudflare R2: private `studio` bucket and public `media` bucket | Free up to 10 GB a month, shared with backups and other media; then US$0.015 per GB-month. Estimated US$0.60–2.50 a month per 100 fully captured products; quick captures fit in the free allowance. No egress charge. |
| Delivery of models and poster images | R2 through each site's media domain, cached by Cloudflare | US$0. Needs a Cache Rule for `.glb` files. |
| Uploads, job tracking, review screens | Dashboard Worker (Workers Free) | US$0. No heavy processing: the Free plan allows 10 ms of CPU per request. |
| Conversion, optimisation, validation, posters | GitHub Actions in a **private** runner repository | US$0 within 2,000 minutes a month. Estimated 2–5 minutes per model, to be measured. |
| Photo reconstruction (photogrammetry) | Apple Object Capture (Mac or LiDAR iPhone), RealityScan or COLMAP on a suitable PC, all free; or the KIRI Engine app. The owner has a Mac, a LiDAR iPhone or iPad and a GPU PC (D-030), so the free tools are used. | US$0 on suitable hardware (RealityScan is free below US$1M company revenue). Otherwise KIRI Engine is US$17.99 a month, or its API US$1 per model after a US$500 minimum top-up. |
| AI image-to-3D drafts (optional) | Tripo (recommended for a trial) or Rodin. Others are compared in `3d-product-studio.md` section 5. | About US$0.20–0.60 per attempt. Not used: the owner chose free methods only (D-030). |
| 3D artist (optional) | Freelance | Quoted per product |
| Turntable videos and scroll sequences | Rendered from the approved model on the processing runner | US$0. AI video would cost US$0.10–0.40 a second and isn't a 3D model. |

Main limitations:

- A few photos can't be measured. AI results from them are *estimates* and
  are labelled so.
- Glossy, white and transparent products are hard to capture for every
  automatic method.
- Approval is always manual.
- Prices and data policies change and are re-checked before each provider
  is enabled.

See section 8 of `3d-product-studio.md` for the full list.
