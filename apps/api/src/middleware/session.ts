import type { Permission } from '@hantex/shared';
import type { MiddlewareHandler } from 'hono';
import { createAuth, FRESH_SESSION_SECONDS } from '../auth/auth';
import type { AppEnv } from '../context';
import { loadAccess } from '../lib/access';
import { forbidden, unauthorized } from '../lib/errors';

/** One database client and one Better Auth instance per request (Workers + Hyperdrive). */
export const withDb: MiddlewareHandler<AppEnv> = async (c, next) => {
  const deps = c.var.deps;
  const { db, close } = await deps.connectDb(c.env);
  c.set('db', db);
  c.set(
    'auth',
    createAuth({
      db,
      env: c.env,
      ...(deps.authPlugins ? { plugins: deps.authPlugins } : {}),
      ...(deps.rateLimits === false ? { rateLimit: false } : {}),
    }),
  );
  try {
    await next();
  } finally {
    try {
      c.executionCtx.waitUntil(close());
    } catch {
      await close();
    }
  }
};

/** Requires a signed-in, active staff member and loads their current permissions. */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const result = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) throw unauthorized();
  const access = await loadAccess(c.var.db, result.user.id);
  if (access?.status !== 'active') throw unauthorized();
  c.set('access', access);
  c.set('session', { id: result.session.id, createdAt: new Date(result.session.createdAt) });
  await next();
};

/** Every listed permission is required; checked on the server for every request. */
export const requirePermission =
  (...permissions: Permission[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const missing = permissions.filter((p) => !c.var.access.permissions.has(p));
    if (missing.length > 0) throw forbidden('missing-permission', { missing });
    await next();
  };

/** For sensitive actions: the sign-in must be recent. */
export const requireFreshSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const age = (Date.now() - c.var.session.createdAt.getTime()) / 1000;
  if (age > FRESH_SESSION_SECONDS) throw forbidden('reauthenticate');
  await next();
};
