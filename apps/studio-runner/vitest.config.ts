import { defineConfig } from 'vitest/config';

// The runner talks to a real PostgreSQL database as the least-privilege hantex_studio_runner
// user (D-056); its tests share the database package's test setup (migrations, roles, grants).
export default defineConfig({
  test: {
    name: 'studio-runner',
    include: ['test/**/*.test.ts'],
    globalSetup: ['../../packages/db/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
