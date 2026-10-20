# Decision log

Decisions are recorded here only once they are confirmed by the project owner.

## Confirmed

| # | Date | Decision | Notes |
|---|------|----------|-------|
| 1 | 2026-10-20 | Use the engineering skills from addyosmani/agent-skills as the development workflow | Vendored into `.claude/skills` and `.claude/agents`; upstream hooks and commands not installed |
| 2 | 2026-10-20 | Development tooling: Context7, 21st.dev Magic, Graphify, Strix | See `docs/tooling.md`. Dev-only; nothing ships to production |

## Open questions

| # | Question | Status |
|---|----------|--------|
| Q1 | Frontend and backend technology stack | Awaiting answer — options: (A) Next.js + Payload CMS, (B) Astro + Hono on Cloudflare Workers, (C) Laravel + Filament. Recommended: A |
