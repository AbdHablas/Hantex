# Implementation plan and checklist

Phases follow the project brief. A phase starts only after the previous one is
approved by the project owner.

**Legend:** [x] done · [ ] pending · [!] blocked

## Phase 1 — Discovery and architecture *(complete)*

- [x] Repository created and push access confirmed
- [x] Development tooling configured (D-001, D-002)
- [x] Frontend and backend stack (D-003)
- [x] Public website framework — Astro (D-004)
- [x] Cost principle — lowest cost (D-005)
- [x] Rendering strategy — static pages rebuilt on publish (D-006)
- [x] Database and data access layer — Neon PostgreSQL via Hyperdrive, Drizzle (D-003)
- [x] Staff sign-in method — passkeys, Workers Free (D-007)
- [x] Cloudflare account, plan and domain — Free plan, domain active on Cloudflare (D-008)
- [x] File storage — Cloudflare R2 (D-003)
- [x] Email sending — Resend (D-009)
- [x] Testing tools — Vitest 4.x, Playwright, axe, Lighthouse (D-003)
- [x] Database backups — Neon restore plus nightly encrypted exports to R2 (D-010)
- [x] Monitoring — Cloudflare logs plus email alerts (D-011)
- [x] Brand reference analysed — `docs/brand-guidelines.md`, icon mark SVGs in `brand/logo/` (D-012)
- [x] Brand typeface — Poppins (D-013)
- [x] Website languages — Arabic (default, RTL) + English (D-014)
- [x] Arabic typeface — Readex Pro (D-015)
- [x] Previous Coming Soon project — never deployed; content set from the dashboard (D-016)
- [x] Dashboard foundation delivered with the Coming Soon page (D-017)
- [x] Launch-notification sign-up — email or WhatsApp (D-018)
- [x] Roles and permission matrix — six standard roles, dynamic matrix (D-019)
- [x] Logo update applied (D-020)
- [x] Light/dark for every design, central appearance system (D-021, D-022)
- [x] `docs/architecture.md` started from confirmed decisions
- [x] `docs/security.md`, `docs/deployment.md` written from confirmed decisions

## Phase 2 — Coming Soon page and dashboard foundation (D-017) *(in progress — approved 2026-10-21)*

- [ ] Design system from the brand reference: design tokens with light and dark values (D-021)
- [x] Repository scaffolding (workspace, TypeScript, ESLint, Prettier, Vitest, local PostgreSQL, CI)
- [ ] Database schema and migrations for the foundation
- [ ] Passkey sign-in, invitations, sessions (Better Auth)
- [ ] Roles and permissions: six standard roles, dynamic matrix editor, audit log
- [ ] Coming Soon settings in the dashboard (Arabic and English) with Publish → rebuild
- [ ] Appearance editor: colours, fonts, shape, motion, mode, logo colours; preview, publish, rollback (D-022)
- [ ] Coming Soon page built and tested (desktop, tablet, mobile)
- [ ] Launch-notification sign-up (email or WhatsApp) with consent, Turnstile, rate limits
- [ ] SEO and social metadata for the Coming Soon state
- [ ] Cloudflare deployment prepared
- [ ] Owner approval to continue

## Phase 3 — Backend and administrative foundation
## Phase 4 — Complete public website
## Phase 5 — Testing and hardening
## Phase 6 — Production deployment

Tasks for phases 3–6 are added once their scope is confirmed.
