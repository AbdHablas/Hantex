import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { serveMedia } from '../../server/media';
import { SITE } from '../../site-data';

export const prerender = false;

/** Media library images (D-044), read from the public bucket; see src/server/media.ts. */
export const GET: APIRoute = ({ request }) =>
  serveMedia(request, {
    bucket: env.MEDIA,
    siteKey: SITE.site.key,
    previewSecret: env.PREVIEW_SIGNING_SECRET,
  });
