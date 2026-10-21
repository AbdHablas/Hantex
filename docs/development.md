# Development

## Requirements

- Node.js 22.22 or newer (`.nvmrc`), pnpm 10 (`corepack enable` picks the
  version pinned in `package.json`).
- PostgreSQL 16 or 17 for local development and tests — either a local
  installation (used by `scripts/local-db.sh`) or Docker.

## First run

```bash
pnpm install
pnpm db:local start      # local PostgreSQL on 127.0.0.1:54329 (data in .local/pg)
pnpm test
```

`scripts/local-db.sh` also supports `stop`, `reset`, `status` and `url`. The
local cluster uses trust authentication on the loopback interface only and
holds development data only — never production data.

## Database

`packages/db` holds the Drizzle schema (`src/schema.ts`), the generated SQL
migrations (`drizzle/`) and the least-privilege grants (`sql/grants.sql`).

```bash
# After changing src/schema.ts: generate a new migration, review the SQL, commit it.
pnpm --filter @hantex/db generate --name <short-description>

# Apply migrations, create/refresh the standard roles, and apply database users + grants.
DATABASE_URL=… pnpm --filter @hantex/db migrate
DATABASE_URL=… pnpm --filter @hantex/db seed
DATABASE_URL=… HANTEX_ADMIN_APP_PASSWORD=… HANTEX_PUBLIC_APP_PASSWORD=… \
  HANTEX_BUILD_PASSWORD=… HANTEX_BACKUP_PASSWORD=… pnpm --filter @hantex/db roles
```

Every new table must also be added to `sql/grants.sql` — nothing is granted by
default. The database tests (`packages/db/src/db.test.ts`) create a throwaway
database, apply migrations, seed and grants, and connect as each database user
to prove what it can and cannot do.

## Checks (same as CI)

```bash
pnpm format:check   # Prettier (code; Markdown is formatted by hand)
pnpm lint           # ESLint, type-aware, plus the no-hard-coded-colours rule
pnpm typecheck      # TypeScript in every package
pnpm test           # Vitest across all packages
pnpm build          # every app
```

CI (`.github/workflows/ci.yml`) runs the same commands on every pull request
and push to `main`, against a throwaway PostgreSQL 17 service, and runs
`pnpm audit --audit-level high`. Third-party actions are pinned to commit
SHAs.

## Repository layout

```
apps/web         Astro public site (Coming Soon, later the full website)
apps/admin       React + Vite dashboard
apps/api         Hono Worker: serves the dashboard and its API
packages/theme   Design tokens, light/dark themes, contrast checks
packages/shared  Permissions catalogue, roles, validation schemas
packages/db      Drizzle schema, migrations, database roles
brand/           Official logo files
docs/            Project documentation
```

Internal packages are consumed as TypeScript source (`exports` points at
`src/index.ts`); the apps' bundlers compile them.

## Tool versions (pinned)

Policy (D-023): the latest stable release of every platform and library,
pinned exactly. Pre-releases are never used, and exceptions are recorded with
their reason.

- **Planned upgrade, first step when development resumes** (checked
  2026-10-21):
  - Node.js 22 → **26**. It becomes Active LTS on 2026-10-28.
  - pnpm 10 → **12**. This moves `onlyBuiltDependencies` to pnpm 11+'s
    `allowBuilds`.
  - PostgreSQL 17 → **18** in CI and local development, matching Neon's
    default.
  - Patch updates for Vite, lucide-react and the Workers types.
- **TypeScript 6.0.3.** TypeScript 7.0 is the latest, but typescript-eslint
  (supports below 6.1) and Astro's checker (5–6) don't support it yet.
  TypeScript 7.0 also has no stable programmatic API until 7.1. A CI check
  will compile the code with TypeScript 7, so the switch is quick when the
  tools are ready.
- **Drizzle ORM 0.45.4,** the latest stable release. 1.0 is still a release
  candidate.
- **Vitest 5** with **`@cloudflare/vitest-plugin`** (the renamed
  `@cloudflare/vitest-pool-workers`) for tests inside the Workers runtime.
