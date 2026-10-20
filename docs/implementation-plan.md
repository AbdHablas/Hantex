# Implementation plan and checklist

Phases follow the project brief. A phase starts only after the previous one is
approved by the project owner.

**Legend:** [x] done · [ ] pending · [!] blocked

## Phase 1 — Discovery and architecture *(current)*

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
- [ ] Brand reference analysed (D-012 — waiting for the reference page and logo files)
- [ ] Initial roles and permission matrix approved
- [x] `docs/architecture.md` started from confirmed decisions
- [ ] `docs/security.md`, `docs/deployment.md` written from confirmed decisions

## Phase 2 — Coming Soon page

- [ ] Design system from the brand reference
- [ ] Coming Soon page built and tested (desktop, tablet, mobile)
- [ ] Optional launch notification (only if approved)
- [ ] SEO and social metadata for the Coming Soon state
- [ ] Cloudflare deployment prepared
- [ ] Owner approval to continue

## Phase 3 — Backend and administrative foundation
## Phase 4 — Complete public website
## Phase 5 — Testing and hardening
## Phase 6 — Production deployment

Tasks for phases 3–6 are added once their scope is confirmed.
