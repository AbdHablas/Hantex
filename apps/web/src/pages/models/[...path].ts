import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { serveModel } from '../../server/media';
import { SITE } from '../../site-data';

export const prerender = false;

/** Published 3D models (D-057), read from the public bucket; see src/server/media.ts. */
export const GET: APIRoute = ({ request }) =>
  serveModel(request, { bucket: env.MEDIA, siteKey: SITE.site.key });
