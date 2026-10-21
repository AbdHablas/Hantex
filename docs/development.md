# Development

## Requirements

- Node.js 26.12 or newer (`.nvmrc`), pnpm 12 (`corepack enable` picks the
  version pinned in `package.json`).
- PostgreSQL 18 for local development and tests, matching Neon and CI —
  either a local installation (used by `scripts/local-db.sh`) or Docker.
  PostgreSQL 16 and 17 still pass the tests today, but 18 is the reference.

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
pnpm build          # every app (the dashboard app, then the dashboard Worker that serves it)
pnpm --filter @hantex/admin e2e   # browser tests, after `pnpm build` (see below)
```

CI (`.github/workflows/ci.yml`) runs the same commands on every pull request
and push to `main`, against a throwaway PostgreSQL 18 service, and runs
`pnpm audit --audit-level high`. Third-party actions are pinned to commit
SHAs.

### Browser tests (end to end)

`apps/admin/e2e` runs the real dashboard Worker (`wrangler dev`, with the
built dashboard) against a throwaway database, in Chromium with a **virtual
passkey authenticator**. The tests follow the first Owner's path: setup link,
passkey, dashboard, edit and publish the Coming Soon page, sign out, sign in
again. They need a PostgreSQL server at `HANTEX_TEST_DATABASE_URL`. If
Playwright's own Chromium isn't installed, set `PLAYWRIGHT_CHROMIUM_PATH`.

### Running the dashboard locally

1. `pnpm db:local start`, then migrate, apply the database users and seed
   (`pnpm --filter @hantex/db migrate|roles|seed`, with `DATABASE_URL` and the
   `HANTEX_*_PASSWORD` variables set to local-only values).
2. Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and fill it with
   local-only random values. Never commit it.
3. `pnpm build`, then `pnpm --filter @hantex/api dev`, and open
   http://localhost:8787.
4. Create the first Owner's link:
   `APP_ORIGIN=http://localhost:8787 pnpm --filter @hantex/db setup-owner you@example.com`.
   Passkeys work on `localhost` without HTTPS.

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

- **Upgraded on 2026-10-21:**
  - **Node.js 26.12.0** (was 22). It becomes Active LTS on 2026-10-28.
    26.12.1 was released the same day and is picked up after pnpm's one-day
    minimum release age.
  - **pnpm 12.14.0** (was 10). `onlyBuiltDependencies` became `allowBuilds`
    in `pnpm-workspace.yaml`. pnpm 12 fails `pnpm -r run` when no package has
    the script, so `pnpm build` uses `--if-present`. 12.15.0 was released the
    same day and is picked up the same way.
  - **PostgreSQL 18** (was 17) in CI. Verified locally with PostgreSQL 18.4:
    format, lint, type-check and all 77 tests pass on Node.js 26.12.0.
  - Patch updates for Vite, lucide-react and the Workers types are applied
    when those packages are added back with the dashboard and site apps.
- **Known audit note:** one *moderate* advisory (GHSA-67mh-4wv8-2f99) in an
  old esbuild pulled in by drizzle-kit, a development-only tool. It affects
  esbuild's development server, which this project doesn't run. CI blocks
  on *high* and above. It is re-checked when drizzle-kit is updated.
- **TypeScript 6.0.3.** TypeScript 7.0 is the latest, but typescript-eslint
  (supports below 6.1) and Astro's checker (5–6) don't support it yet.
  TypeScript 7.0 also has no stable programmatic API until 7.1. A CI check
  will compile the code with TypeScript 7, so the switch is quick when the
  tools are ready.
- **Drizzle ORM 0.45.4,** the latest stable release. 1.0 is still a release
  candidate.
- **One-day wait for new releases.** pnpm refuses packages published less
  than a day ago (`minimumReleaseAge`); we pin the previous release and
  upgrade the next day rather than adding exemptions.
- **`@simplewebauthn/browser` 13.3.0**, matching the server-side version 13
  used by Better Auth's passkey plugin.
- **Vitest 5** with **`@cloudflare/vitest-plugin`** (the renamed
  `@cloudflare/vitest-pool-workers`) for tests inside the Workers runtime.
