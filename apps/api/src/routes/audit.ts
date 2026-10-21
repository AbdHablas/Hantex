import { validate } from '../lib/validate';
import { auditLog } from '@hantex/db';
import { desc, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { requirePermission } from '../middleware/session';

export const auditRoutes = new Hono<AppEnv>().get(
  '/',
  requirePermission('audit.view'),
  validate('query', z.strictObject({ before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) })),
  async (c) => {
    const { before, limit } = c.req.valid('query');
    const rows = await c.var.db
      .select()
      .from(auditLog)
      .where(before ? lt(auditLog.id, before) : undefined)
      .orderBy(desc(auditLog.id))
      .limit(limit);
    return c.json({ entries: rows, next: rows.length === limit ? rows.at(-1)?.id ?? null : null });
  },
);
