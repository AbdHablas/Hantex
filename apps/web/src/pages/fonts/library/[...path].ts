import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { serveFont } from '../../../server/media';

export const prerender = false;

/** Fonts uploaded by the Owner (D-033), read from the public bucket; see src/server/media.ts. */
export const GET: APIRoute = ({ request }) => serveFont(request, env.MEDIA);
