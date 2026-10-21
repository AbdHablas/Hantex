/**
 * Web server for the browser tests (Playwright starts it before anything else): creates a
 * throwaway database, publishes test content, builds the site from it exactly as the publish
 * workflow will (read-only build user), then serves the built Worker with `wrangler dev`.
 */
import {
  APP_DB_ROLES,
  FIRST_SITE,
  applyDatabaseRoles,
  createPoolDb,
  documentVersions,
  ensureSite,
  runMigrations,
  syncStandardRoles,
} from '@hantex/db';
import { DEFAULT_COMING_SOON, DEFAULT_SITE_SETTINGS } from '@hantex/shared';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const env = process.env;
const base = env['HANTEX_TEST_DATABASE_URL'] ?? 'postgres://postgres@127.0.0.1:54329/postgres';
const name = env['E2E_DATABASE'] ?? 'hantex_web_e2e';
const url = (user?: string, password?: string) => {
  const u = new URL(base);
  u.pathname = `/${name}`;
  if (user) {
    u.username = user;
    u.password = password ?? '';
  }
  return u.toString();
};

const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(name)} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(name)}`);
await admin.end();

const { db, close } = createPoolDb(url(), 1);
await runMigrations(db);
await syncStandardRoles(db);
const siteId = await ensureSite(db, FIRST_SITE);
const passwords = Object.fromEntries(
  APP_DB_ROLES.map((r) => [r, randomBytes(16).toString('hex')]),
) as Record<(typeof APP_DB_ROLES)[number], string>;
passwords.hantex_build = env['E2E_BUILD_PASSWORD'] ?? passwords.hantex_build;
passwords.hantex_public_app = env['E2E_PUBLIC_PASSWORD'] ?? passwords.hantex_public_app;
await applyDatabaseRoles(url(), passwords);

// Published content (what the dashboard's Publish button writes).
await db.insert(documentVersions).values([
  {
    siteId,
    kind: 'coming-soon',
    version: 1,
    data: {
      ...DEFAULT_COMING_SOON,
      headline: { ar: 'شيء جديد قادم', en: 'Something new is coming' },
      tagline: { ar: 'مفاتيح ومقابس', en: 'Switches and sockets' },
      launchAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      showCountdown: true,
      milestones: [{ date: '2026-10-01', title: { ar: 'التصميم', en: 'Design' }, done: true }],
      highlights: [{ title: { ar: 'ميزة', en: 'Feature' }, text: { ar: 'نص', en: 'Text' } }],
    },
  },
  {
    siteId,
    kind: 'site-settings',
    version: 1,
    data: {
      ...DEFAULT_SITE_SETTINGS,
      contact: { ...DEFAULT_SITE_SETTINGS.contact, email: 'hello@example.test' },
    },
  },
]);
await close();

execFileSync('pnpm', ['build'], {
  stdio: 'inherit',
  env: {
    ...env,
    SITE: FIRST_SITE.key,
    HANTEX_BUILD_DATABASE_URL: url('hantex_build', passwords.hantex_build),
    // Cloudflare's published Turnstile test key that always fails (see the spec).
    TURNSTILE_SITE_KEY: '2x00000000000000000000AB',
  },
});

const port = env['E2E_PORT'] ?? '8789';
const server = spawn(
  'pnpm',
  [
    'exec',
    'wrangler',
    'dev',
    '--port',
    port,
    '--ip',
    '127.0.0.1',
    '--var',
    'TURNSTILE_SECRET_KEY:2x0000000000000000000000000000000AA',
    '--var',
    `PREVIEW_SIGNING_SECRET:${env['E2E_PREVIEW_SECRET'] ?? ''}`,
  ],
  {
    stdio: 'inherit',
    env: {
      ...env,
      WRANGLER_SEND_METRICS: 'false',
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: url(
        'hantex_public_app',
        passwords.hantex_public_app,
      ),
    },
  },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
