import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import pg from 'pg';
import { handleSignup, verifyTurnstile } from '../../server/signup';
import { signupStore } from '../../server/store';
import { SITE } from '../../site-data';

export const prerender = false;

/** Launch sign-up: one short database connection per request, as the public database user. */
export const POST: APIRoute = async ({ request }) => {
  let client: pg.Client | null = null;
  const store = async () => {
    if (!client) {
      client = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
      await client.connect();
    }
    return signupStore(client, SITE.site.id ?? '');
  };
  try {
    return await handleSignup(request, {
      siteId: SITE.site.id,
      verifyTurnstile: (token, ip) => verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, ip),
      allow: async (key, limit, windowMs) => (await store()).allow(key, limit, windowMs),
      insert: async (row) => (await store()).insert(row),
    });
  } catch (error) {
    console.error('signup failed', error instanceof Error ? error.name : 'unknown');
    return new Response(JSON.stringify({ error: 'request-error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } finally {
    const open = client as pg.Client | null;
    if (open) await open.end().catch(() => undefined);
  }
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });
