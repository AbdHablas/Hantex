// @ts-check
import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

// Site engine (D-006, D-028): pages are pre-rendered from one site's published data
// (scripts/site-data.ts); only the sign-up endpoint and draft previews run on the Worker.
export default defineConfig({
  output: 'static',
  // Images are served as they are (no Cloudflare Images binding or transformations).
  adapter: cloudflare({ imageService: 'passthrough' }),
  // No sessions: the public sites keep no visitor state (and need no KV namespace).
  session: false,
  // Every stylesheet is a file, so the Content-Security-Policy needs no 'unsafe-inline'.
  build: { inlineStylesheets: 'never', format: 'directory' },
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  // Never inline scripts either: the CSP allows only script files.
  vite: { build: { assetsInlineLimit: 0 } },
  // The dashboard's preview form posts here from its own origin and is authenticated by its
  // signature; the sign-up endpoint checks the Origin header itself (src/pages/api/signup.ts).
  security: { checkOrigin: false },
});
