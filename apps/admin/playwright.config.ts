import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';

/**
 * End-to-end tests: the real dashboard Worker (`wrangler dev`, built dashboard app) against a
 * throwaway local PostgreSQL database, in Chromium with a virtual passkey authenticator.
 * Run with a PostgreSQL server at HANTEX_TEST_DATABASE_URL, after `pnpm build`.
 *
 * Values are generated once in the main process and inherited by the test workers.
 */
const env = process.env;
env['E2E_PORT'] ??= '8788';
env['E2E_ORIGIN'] ??= `http://localhost:${env['E2E_PORT']}`;
env['E2E_DATABASE'] ??= `hantex_e2e_${process.pid}`;
env['E2E_DB_PASSWORD'] ??= randomBytes(16).toString('hex');
const base = new URL(
  env['HANTEX_TEST_DATABASE_URL'] ?? 'postgres://postgres@127.0.0.1:54329/postgres',
);
const appDb = new URL(base);
appDb.username = 'hantex_admin_app';
appDb.password = env['E2E_DB_PASSWORD'];
appDb.pathname = `/${env['E2E_DATABASE']}`;

const secret = () => randomBytes(32).toString('base64url');
const vars = {
  ENVIRONMENT: 'development',
  APP_ORIGIN: env['E2E_ORIGIN'],
  BETTER_AUTH_SECRET: secret(),
  TOKEN_HASH_SECRET: secret(),
  PREVIEW_SIGNING_SECRET: secret(),
  EMAIL_FROM: 'Dashboard <dashboard@example.test>',
  // Cloudflare's published Turnstile test keys (always pass).
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
};

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: env['E2E_ORIGIN'],
    locale: 'ar',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: env['PLAYWRIGHT_CHROMIUM_PATH']
      ? { executablePath: env['PLAYWRIGHT_CHROMIUM_PATH'] }
      : {},
  },
  webServer: {
    command: `pnpm --filter @hantex/api exec wrangler dev --port ${env['E2E_PORT']} --ip 127.0.0.1 ${Object.entries(
      vars,
    )
      .map(([k, v]) => `--var '${k}:${v}'`)
      .join(' ')}`,
    url: `${env['E2E_ORIGIN']}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      WRANGLER_SEND_METRICS: 'false',
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: appDb.toString(),
    },
  },
});
