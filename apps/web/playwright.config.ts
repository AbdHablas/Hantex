import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';

/**
 * Browser tests of a public site built from published content in a throwaway database
 * (e2e/serve.ts). Needs a PostgreSQL server at HANTEX_TEST_DATABASE_URL.
 */
const env = process.env;
env['E2E_PORT'] ??= '8789';
env['E2E_DATABASE'] ??= `hantex_web_e2e_${process.pid}`;
env['E2E_BUILD_PASSWORD'] ??= randomBytes(16).toString('hex');
env['E2E_PUBLIC_PASSWORD'] ??= randomBytes(16).toString('hex');
env['E2E_PREVIEW_SECRET'] ??= randomBytes(32).toString('base64url');

export default defineConfig({
  testDir: 'e2e',
  globalTeardown: './e2e/global-teardown.ts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${env['E2E_PORT']}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: env['PLAYWRIGHT_CHROMIUM_PATH']
      ? { executablePath: env['PLAYWRIGHT_CHROMIUM_PATH'] }
      : {},
  },
  webServer: {
    command: 'pnpm exec tsx e2e/serve.ts',
    url: `http://localhost:${env['E2E_PORT']}/`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
