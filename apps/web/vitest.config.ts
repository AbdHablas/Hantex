import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // A throwaway database with migrations and the least-privilege database users.
    globalSetup: ['../../packages/db/test/global-setup.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});
