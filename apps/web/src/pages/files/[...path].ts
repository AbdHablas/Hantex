import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { serveFile } from '../../server/media';
import { SITE } from '../../site-data';

export const prerender = false;

/** Published files (PDF, D-045), read from the public bucket; see src/server/media.ts. */
export const GET: APIRoute = ({ request }) =>
  serveFile(request, { bucket: env.MEDIA, siteKey: SITE.site.key });
