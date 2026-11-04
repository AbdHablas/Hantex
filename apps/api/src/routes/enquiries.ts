import { enquiries } from '@hantex/db/worker';
import { ENQUIRY_STATUSES } from '@hantex/shared';
import { and, desc, eq, ilike, lt, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { maskContact, writeAudit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/session';
import { csvCell } from './subscribers';

/**
 * Enquiries and quotation requests (D-051), sent from the website and answered by staff. Staff
 * can read them, export them, mark them replied or closed, and delete them; their content is
 * never edited. The audit log records actions with masked contact details only.
 */
const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
const idParam = validate('param', z.object({ id: z.uuid() }));

export const enquiryRoutes = new Hono<AppEnv>()
  .get(
    '/',
    requirePermission('enquiries.view'),
    validate(
      'query',
      z.strictObject({
        status: z.enum(ENQUIRY_STATUSES).optional(),
        q: z.string().trim().max(100).optional(),
        before: z.iso.datetime().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    ),
    async (c) => {
      const { status, q, before, limit } = c.req.valid('query');
      const like = q ? `%${escapeLike(q)}%` : null;
      const rows = await c.var.db
        .select()
        .from(enquiries)
        .where(
          and(
            eq(enquiries.siteId, c.var.site.id),
            status ? eq(enquiries.status, status) : undefined,
            like
              ? or(
                  ilike(enquiries.name, like),
                  ilike(enquiries.contactValue, like),
                  ilike(enquiries.company, like),
                  ilike(enquiries.productName, like),
                  ilike(enquiries.message, like),
                )
              : undefined,
            before ? lt(enquiries.createdAt, new Date(before)) : undefined,
          ),
        )
        .orderBy(desc(enquiries.createdAt))
        .limit(limit);
      return c.json({
        enquiries: rows,
        next: rows.length === limit ? (rows.at(-1)?.createdAt ?? null) : null,
      });
    },
  )

  .get('/export', requirePermission('enquiries.export'), async (c) => {
    const v = c.var;
    const rows = await v.db
      .select()
      .from(enquiries)
      .where(eq(enquiries.siteId, v.site.id))
      .orderBy(enquiries.createdAt);
    const lines = [
      [
        'received_at',
        'status',
        'kind',
        'product',
        'name',
        'contact',
        'contact_type',
        'company',
        'quantity',
        'message',
        'language',
        'consent_version',
      ]
        .map(csvCell)
        .join(','),
      ...rows.map((r) =>
        [
          r.createdAt.toISOString(),
          r.status,
          r.kind,
          r.productName,
          r.name,
          r.contactValue,
          r.contactType,
          r.company,
          r.quantity === null ? '' : String(r.quantity),
          r.message,
          r.locale,
          r.consentVersion,
        ]
          .map(csvCell)
          .join(','),
      ),
    ];
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'enquiries.exported', siteId: v.site.id, details: { count: rows.length } },
      v.requestId,
    );
    // Byte order mark so spreadsheet programs read Arabic text correctly.
    return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${v.site.key}-enquiries-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  })

  .patch(
    '/:id',
    requirePermission('enquiries.manage'),
    idParam,
    validate('json', z.strictObject({ status: z.enum(ENQUIRY_STATUSES) })),
    async (c) => {
      const v = c.var;
      const { status } = c.req.valid('json');
      const [row] = await v.db
        .update(enquiries)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(enquiries.id, c.req.valid('param').id), eq(enquiries.siteId, v.site.id)))
        .returning({ id: enquiries.id, contactValue: enquiries.contactValue });
      if (!row) throw notFound();
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'enquiries.status-changed',
          siteId: v.site.id,
          targetType: 'enquiry',
          targetId: row.id,
          details: { status, contact: maskContact(row.contactValue) },
        },
        v.requestId,
      );
      return c.json({ ok: true });
    },
  )

  .delete('/:id', requirePermission('enquiries.delete'), idParam, async (c) => {
    const v = c.var;
    const [row] = await v.db
      .delete(enquiries)
      .where(and(eq(enquiries.id, c.req.valid('param').id), eq(enquiries.siteId, v.site.id)))
      .returning({ id: enquiries.id, contactValue: enquiries.contactValue });
    if (!row) throw notFound();
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'enquiries.deleted',
        siteId: v.site.id,
        targetType: 'enquiry',
        targetId: row.id,
        details: { contact: maskContact(row.contactValue) },
      },
      v.requestId,
    );
    return c.json({ ok: true });
  });
