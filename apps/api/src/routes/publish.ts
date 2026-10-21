import { publishJobs } from '@hantex/db';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { timingSafeEqual } from '../lib/crypto';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import { validate } from '../lib/validate';

export const publishJobRoutes = new Hono<AppEnv>().get('/jobs', async (c) => {
  const p = c.var.access.permissions;
  if (!p.has('site.publish') && !p.has('appearance.publish')) throw forbidden('missing-permission');
  const rows = await c.var.db.select().from(publishJobs).orderBy(desc(publishJobs.requestedAt)).limit(20);
  return c.json(rows);
});

/** Called by the publish workflow (machine to machine) with a bearer secret; no session. */
export const publishCallbackRoutes = new Hono<AppEnv>().post(
  '/jobs/:id/result',
  validate('param', z.object({ id: z.uuid() })),
  validate('json', z.strictObject({ status: z.enum(['succeeded', 'failed']), detail: z.string().max(200).optional() })),
  async (c) => {
    const secret = c.env.PUBLISH_CALLBACK_SECRET;
    const given = c.req.header('Authorization')?.replace(/^Bearer /, '') ?? '';
    if (!secret || !timingSafeEqual(given, secret)) throw unauthorized();
    const body = c.req.valid('json');
    const [row] = await c.var.db
      .update(publishJobs)
      .set({ status: body.status, detail: body.detail ?? null, completedAt: new Date() })
      .where(eq(publishJobs.id, c.req.valid('param').id))
      .returning({ id: publishJobs.id });
    if (!row) throw notFound();
    return c.json({ ok: true });
  },
);
