import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The dashboard is served by the dashboard Worker (apps/api) on the same origin as its API.
// In development, API calls go to `wrangler dev` on port 8787.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { sourcemap: true },
  test: {
    name: 'admin',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
