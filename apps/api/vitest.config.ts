import { defineConfig } from 'vitest/config';

// The API runs on Cloudflare Workers; its tests run the same Hono app in Node.js against a real
// PostgreSQL database, connected as the dashboard's least-privilege database user.
export default defineConfig({
  test: {
    name: 'api',
    include: ['test/**/*.test.ts'],
    globalSetup: ['../../packages/db/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
