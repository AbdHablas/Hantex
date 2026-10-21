import { Hono } from 'hono';
import { FRESH_SESSION_SECONDS } from '../auth/auth';
import type { AppEnv } from '../context';
import { forbidden, notFound } from '../lib/errors';

/**
 * Only the Better Auth endpoints the dashboard uses are reachable; everything else (sign-up,
 * update-user, delete-user, change-email, passkey deletion without our checks, …) answers 404.
 */
const ALLOWED: Record<string, string> = {
  '/api/auth/get-session': 'GET',
  '/api/auth/sign-out': 'POST',
  '/api/auth/passkey/generate-register-options': 'GET',
  '/api/auth/passkey/verify-registration': 'POST',
  '/api/auth/passkey/generate-authenticate-options': 'GET',
  '/api/auth/passkey/verify-authentication': 'POST',
  '/api/auth/passkey/list-user-passkeys': 'GET',
  '/api/auth/passkey/update-passkey': 'POST',
};

export const authRoutes = new Hono<AppEnv>().all('/*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (ALLOWED[path] !== c.req.method) throw notFound();

  // Adding a passkey while signed in needs a recent sign-in (a stolen session cannot add one).
  if (path === '/api/auth/passkey/generate-register-options') {
    const current = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
    if (current) {
      const age = (Date.now() - new Date(current.session.createdAt).getTime()) / 1000;
      if (age > FRESH_SESSION_SECONDS) throw forbidden('reauthenticate');
    }
  }
  return c.var.auth.handler(c.req.raw);
});
