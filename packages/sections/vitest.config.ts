import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'sections', include: ['src/**/*.test.ts'] },
});
