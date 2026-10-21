import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'theme', include: ['src/**/*.test.ts'] },
});
