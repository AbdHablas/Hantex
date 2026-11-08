import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'studio', include: ['src/**/*.test.ts'] },
});
