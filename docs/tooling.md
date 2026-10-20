# Development tooling

Tools used while building the Hantex Ultra platform. None of them ship with the
website or run in production.

| Tool | What it does | Where it's configured | When we use it |
|------|--------------|-----------------------|----------------|
| [Context7](https://github.com/upstash/context7) | Up-to-date, version-specific library docs for the coding agent | `.mcp.json` (`context7`) | Every phase — before using any framework API |
| [21st.dev Magic](https://21st.dev/mcp) | Generates UI components from prompts | `.mcp.json` (`magic`) | Phase 2 onwards, as a starting point only — every component is reviewed and restyled to the Hantex Ultra design system |
| [Graphify](https://github.com/Graphify-Labs/graphify) | Builds a queryable knowledge graph of the codebase | Installed per developer machine (`uv tool install graphifyy`) | Once the codebase is large enough to benefit (Phase 3+) |
| [Strix](https://github.com/usestrix/strix) | Autonomous AI penetration testing | Installed per developer machine; needs Docker and an LLM key | Phase 5 hardening, and later in CI — only against our own local or staging builds, never production without approval |

## Setup

1. Copy `.env.example` to `.env` and fill in the keys you need. Never commit `.env`.
2. Export the variables in your shell before starting Claude Code, so `.mcp.json` can read them.
3. Claude Code asks you to approve the project MCP servers the first time it opens the repo.

## Notes

- Package versions in `.mcp.json` are pinned. Update them deliberately, not with `@latest`.
- Strix runs real attacks. Point it only at environments we own, and never at the
  production domain without explicit approval.
- Graphify parses code locally; its semantic pass over docs and images uses an
  LLM, so don't run it over files containing secrets or personal data.
- `strix_runs/` and `graphify-out/` are git-ignored.
