import { subscribers } from '@hantex/db/worker';
import { and, desc, eq, ilike, lt, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { maskContact, writeAudit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/session';

const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** CSV cell that spreadsheet programs will not run as a formula. */
export function csvCell(value: string): string {
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const subscriberRoutes = new Hono<AppEnv>()
  .get(
    '/',
    requirePermission('subscribers.view'),
    validate(
      'query',
      z.strictObject({
        q: z.string().trim().max(100).optional(),
        before: z.iso.datetime().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    ),
    async (c) => {
      const { q, before, limit } = c.req.valid('query');
      const rows = await c.var.db
        .select()
        .from(subscribers)
        .where(
          and(
            eq(subscribers.siteId, c.var.site.id),
            q ? or(ilike(subscribers.contactValue, `%${escapeLike(q)}%`)) : undefined,
            before ? lt(subscribers.createdAt, new Date(before)) : undefined,
          ),
        )
        .orderBy(desc(subscribers.createdAt))
        .limit(limit);
      return c.json({
        subscribers: rows,
        next: rows.length === limit ? (rows.at(-1)?.createdAt ?? null) : null,
      });
    },
  )

  .get('/export', requirePermission('subscribers.export'), async (c) => {
    const v = c.var;
    const rows = await v.db
      .select()
      .from(subscribers)
      .where(eq(subscribers.siteId, v.site.id))
      .orderBy(subscribers.createdAt);
    const lines = [
      ['contact', 'type', 'language', 'consent_version', 'signed_up_at'].map(csvCell).join(','),
      ...rows.map((r) =>
        [r.contactValue, r.contactType, r.locale, r.consentVersion, r.createdAt.toISOString()]
          .map(csvCell)
          .join(','),
      ),
    ];
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'subscribers.exported', siteId: v.site.id, details: { count: rows.length } },
      v.requestId,
    );
    // Byte order mark so spreadsheet programs read Arabic text correctly.
    return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${v.site.key}-signups-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  })

  .delete(
    '/:id',
    requirePermission('subscribers.delete'),
    validate('param', z.object({ id: z.uuid() })),
    async (c) => {
      const v = c.var;
      const [row] = await v.db
        .delete(subscribers)
        .where(and(eq(subscribers.id, c.req.valid('param').id), eq(subscribers.siteId, v.site.id)))
        .returning();
      if (!row) throw notFound();
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'subscribers.deleted',
          siteId: v.site.id,
          targetType: 'subscriber',
          targetId: row.id,
          details: { contact: maskContact(row.contactValue) },
        },
        v.requestId,
      );
      return c.json({ ok: true });
    },
  );
