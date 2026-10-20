# Vendored agent skills

Skills copied from upstream repositories. Licences are in `_licenses/`.
Only skill files were copied — no upstream hooks or slash commands, so nothing
runs automatically.

| Source | Commit | Licence | Skills |
|--------|--------|---------|--------|
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `aeac41d4d005` | MIT | 25 workflow skills (spec, plan, TDD, security, frontend UI, ship, …) + 4 agents in `../agents` |
| [usestrix/strix](https://github.com/usestrix/strix) | `aa2036f22942` | Apache-2.0 | api-security-testing, application-security-testing, ci-security-scanning-with-strix, find-security-vulnerabilities-in-code, fix-security-vulnerabilities-with-strix, managed-pentesting-with-strix, owasp-top-10-testing, penetration-testing-with-strix, web-app-penetration-testing |
| [upstash/context7](https://github.com/upstash/context7) | `2dc35112ef1b` | MIT | context7-mcp, context7-cli, find-docs |
| [21st-dev/magic-mcp](https://github.com/21st-dev/magic-mcp) | `6b5299e8a83c` | ISC | 21st-ui |
| [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | `b90b9df7949b` | Apache-2.0 | graphify |

## Notes

- **Strix** skills run real attacks. Use them only against our own local or
  staging builds — never the production domain without explicit approval.
- **graphify** installs the `graphifyy` Python package on first use if it is
  missing.
- **context7-cli / find-docs** call `npx ctx7@latest`; **context7-mcp** uses the
  MCP server in `.mcp.json`.

To update a source: re-copy its skills from a newer upstream commit and update
the table above.
