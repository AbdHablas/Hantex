import { auditLog } from '@hantex/db/worker';
import { and, desc, eq, lt } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/session';

const query = validate(
  'query',
  z.strictObject({
    before: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
);

async function page(
  c: Context<AppEnv>,
  siteId: string | null,
  { before, limit }: { before?: number | undefined; limit: number },
) {
  const rows = await c.var.db
    .select()
    .from(auditLog)
    .where(
      and(
        siteId ? eq(auditLog.siteId, siteId) : undefined,
        before ? lt(auditLog.id, before) : undefined,
      ),
    )
    .orderBy(desc(auditLog.id))
    .limit(limit);
  return c.json({
    entries: rows,
    next: rows.length === limit ? (rows.at(-1)?.id ?? null) : null,
  });
}

/** The whole audit log, every site and the platform: all-sites staff only. */
export const auditRoutes = new Hono<AppEnv>().get(
  '/',
  requirePermission('audit.view'),
  query,
  (c) => page(c, null, c.req.valid('query')),
);

/** One site's entries (D-025: staff see the audit log within the sites they cover). */
export const siteAuditRoutes = new Hono<AppEnv>().get(
  '/',
  requirePermission('audit.view'),
  query,
  (c) => page(c, c.var.site.id, c.req.valid('query')),
);
