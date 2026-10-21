import { sites } from '@hantex/db/worker';
import { siteKeySchema, type Permission } from '@hantex/shared';
import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { createAuth, FRESH_SESSION_SECONDS } from '../auth/auth';
import type { AppEnv } from '../context';
import { allSitesPermissions, coversSite, loadAccess, permissionsOn } from '../lib/access';
import { conflict, forbidden, notFound, unauthorized } from '../lib/errors';

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
  c.set('permissions', allSitesPermissions(access));
  c.set('session', { id: result.session.id, createdAt: new Date(result.session.createdAt) });
  await next();
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Site-scoped routes (`/api/sites/:siteKey/...`): loads the site and switches the request's
 * permissions to the person's permissions on that site (D-025). A site the person does not
 * cover answers "not found", exactly like a site that does not exist. Archived sites are
 * read-only.
 */
export const withSite: MiddlewareHandler<AppEnv> = async (c, next) => {
  const key = siteKeySchema.safeParse(c.req.param('siteKey'));
  if (!key.success) throw notFound();
  const [site] = await c.var.db.select().from(sites).where(eq(sites.key, key.data));
  if (!site || !coversSite(c.var.access, site.id)) throw notFound();
  // Archived sites are read-only; restoring one is the only change allowed.
  const restoring = c.req.method === 'POST' && c.req.path.endsWith('/restore');
  if (site.archivedAt && !SAFE_METHODS.has(c.req.method) && !restoring) {
    throw conflict('site-archived');
  }
  c.set('site', {
    id: site.id,
    key: site.key,
    nameAr: site.nameAr,
    nameEn: site.nameEn,
    locales: site.locales,
    defaultLocale: site.defaultLocale,
    mode: site.mode,
    template: site.template,
    archivedAt: site.archivedAt,
  });
  c.set('permissions', permissionsOn(c.var.access, site.id));
  await next();
};

/** Every listed permission is required; checked on the server for every request. */
export const requirePermission =
  (...permissions: Permission[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const missing = permissions.filter((p) => !c.var.permissions.has(p));
    if (missing.length > 0) throw forbidden('missing-permission', { missing });
    await next();
  };

/** Platform-wide permissions (managing Owners, roles, security, sites) need an all-sites role. */
export const requirePlatformPermission =
  (...permissions: Permission[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const missing = permissions.filter((p) => !c.var.access.platform.has(p));
    if (missing.length > 0) throw forbidden('missing-permission', { missing });
    await next();
  };

/** For sensitive actions: the sign-in must be recent. */
export const requireFreshSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const age = (Date.now() - c.var.session.createdAt.getTime()) / 1000;
  if (age > FRESH_SESSION_SECONDS) throw forbidden('reauthenticate');
  await next();
};
