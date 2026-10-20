# Decision log

Decisions are recorded here only once they are confirmed by the project owner.

## Confirmed

| # | Date | Decision | Notes |
|---|------|----------|-------|
| 1 | 2026-10-20 | ~~Vendor addyosmani/agent-skills into the repo~~ | Superseded by #4 |
| 2 | 2026-10-20 | Development tooling: Context7, 21st.dev Magic, Graphify, Strix | See `docs/tooling.md`. Dev-only; nothing ships to production |
| 3 | 2026-10-20 | ~~Vendor skills from Strix, Context7, 21st.dev Magic and Graphify~~ | Superseded by #4 |
| 4 | 2026-10-20 | Agent skills are not kept in the repository | Removed `.claude/skills` and `.claude/agents`; install them per machine if wanted |

## Open questions

| # | Question | Status |
|---|----------|--------|
| Q1 | Frontend and backend technology stack | Awaiting answer — options: (A) Next.js + Payload CMS, (B) Astro + Hono on Cloudflare Workers, (C) Laravel + Filament. Recommended: A |
