import { siteFiles } from '@hantex/db/worker';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import {
  catalogueFileUses,
  catalogueFileUsesOf,
  draftCatalogue,
  publishedCatalogue,
  withCatalogueLock,
} from '../lib/catalogue-content';
import { badRequest, conflict, notFound } from '../lib/errors';
import { privateFileKey, publicFileKey } from '../lib/media-store';
import { PDF_MAX_BYTES, readPdf } from '../lib/pdf';
import { storedBytes } from '../lib/site-files';
import { validate } from '../lib/validate';
import { quotaBytes } from './media';
import { requirePermission } from '../middleware/session';

/**
 * A website's files (D-045): PDF datasheets, installation guides and certificates that products
 * and series attach. Uploaded files are checked (lib/pdf.ts) and kept private; staff download
 * them through this API, and they become public when published content attaches them. A file
 * that a draft or the live catalogue attaches can't be deleted.
 */

const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });
const idParam = validate('param', z.object({ id: z.uuid() }));
const nameSchema = z.strictObject({ name: z.string().trim().min(1).max(120) });

const asItem = (siteKey: string, row: typeof siteFiles.$inferSelect) => ({
  id: row.id,
  name: row.name,
  bytes: row.bytes,
  createdAt: row.createdAt,
  published: row.publishedAt !== null,
  // Served by this API to signed-in staff only, always as a download.
  url: `/api/sites/${encodeURIComponent(siteKey)}/catalogue/files/${row.id}/file.pdf`,
});

export const catalogueFileRoutes = new Hono<AppEnv>()
  /** Every file, newest first, with what attaches it. */
  .get('/', requirePermission('catalogue.view'), async (c) => {
    const v = c.var;
    const [rows, draft, live] = await Promise.all([
      v.db
        .select()
        .from(siteFiles)
        .where(eq(siteFiles.siteId, v.site.id))
        .orderBy(desc(siteFiles.createdAt))
        .limit(500),
      draftCatalogue(v.db, v.site.id),
      publishedCatalogue(v.db, v.site.id),
    ]);
    return c.json({
      items: rows.map((row) => {
        const uses = [...catalogueFileUsesOf(draft, row.id), ...catalogueFileUsesOf(live, row.id)];
        return {
          ...asItem(v.site.key, row),
          uses: [...new Map(uses.map((x) => [`${x.type}:${x.id}`, x])).values()],
        };
      }),
      usedBytes: await storedBytes(v.db, v.site.id),
      quotaBytes: quotaBytes(c.env),
      maxBytes: PDF_MAX_BYTES,
    });
  })

  /** multipart/form-data: `meta` (JSON: name) and one PDF, `file`. */
  .post(
    '/',
    requirePermission('catalogue.edit'),
    bodyLimit({
      maxSize: PDF_MAX_BYTES + 64 * 1024,
      onError: () => {
        throw badRequest('file-too-large');
      },
    }),
    async (c) => {
      const v = c.var;
      const form = await c.req.formData().catch(() => null);
      if (!form) throw badRequest('invalid-input');
      let parsedMeta: unknown = null;
      try {
        const raw = form.get('meta');
        parsedMeta = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : null;
      } catch {
        // Reported below.
      }
      const meta = nameSchema.safeParse(parsedMeta);
      if (!meta.success) throw badRequest('invalid-input');
      const fields = [...form.keys()];
      const file = form.get('file');
      if (fields.length !== 2 || !file || typeof file === 'string') {
        throw badRequest('invalid-file', { reason: 'not-pdf' });
      }
      if (file.size > PDF_MAX_BYTES) throw badRequest('file-too-large');
      const data = await file.arrayBuffer();
      const result = readPdf(data);
      if (!result.ok) {
        if (result.reason === 'too-large') throw badRequest('file-too-large');
        throw badRequest('invalid-file', { reason: result.reason });
      }
      if ((await storedBytes(v.db, v.site.id)) + data.byteLength > quotaBytes(c.env)) {
        throw conflict('media-quota');
      }

      const id = crypto.randomUUID();
      await v.deps.media(c.env).put(privateFileKey(v.site.id, id), data, 'application/pdf');
      await v.db.insert(siteFiles).values({
        id,
        siteId: v.site.id,
        name: meta.data.name,
        bytes: data.byteLength,
        createdBy: v.access.userId,
      });
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'file.uploaded',
          siteId: v.site.id,
          targetType: 'file',
          targetId: id,
          details: { name: meta.data.name, bytes: data.byteLength },
        },
        v.requestId,
      );
      return c.json({ id }, 201);
    },
  )

  .get('/:id/file.pdf', requirePermission('catalogue.view'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const [row] = await v.db
      .select({ id: siteFiles.id })
      .from(siteFiles)
      .where(and(eq(siteFiles.id, id), eq(siteFiles.siteId, v.site.id)));
    if (!row) throw notFound();
    const stored = await v.deps.media(c.env).get(privateFileKey(v.site.id, id));
    if (!stored) throw notFound();
    return new Response(stored.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(stored.size),
        // Always a download: never drawn inside the dashboard's own address.
        'Content-Disposition': `attachment; filename="${id}.pdf"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
      },
    });
  })

  .patch(
    '/:id',
    requirePermission('catalogue.edit'),
    idParam,
    validate('json', nameSchema),
    async (c) => {
      const v = c.var;
      const [row] = await v.db
        .update(siteFiles)
        .set({ name: c.req.valid('json').name })
        .where(and(eq(siteFiles.id, c.req.valid('param').id), eq(siteFiles.siteId, v.site.id)))
        .returning();
      if (!row) throw notFound();
      return c.json(asItem(v.site.key, row));
    },
  )

  .delete('/:id', requirePermission('catalogue.delete'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    // Under the catalogue lock, so nothing attaches the file between the check and the delete.
    const row = await withCatalogueLock(v.db, v.site.id, async (tx) => {
      const uses = await catalogueFileUses(tx, v.site.id, id);
      if (uses.length > 0) throw conflict('file-in-use', { uses });
      const [deleted] = await tx
        .delete(siteFiles)
        .where(and(eq(siteFiles.id, id), eq(siteFiles.siteId, v.site.id)))
        .returning();
      return deleted;
    });
    if (!row) throw notFound();
    await v.deps.media(c.env).delete([privateFileKey(v.site.id, id)]);
    await v.deps.publicMedia(c.env).delete([publicFileKey(v.site.key, id)]);
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'file.deleted',
        siteId: v.site.id,
        targetType: 'file',
        targetId: id,
        details: { name: row.name },
      },
      v.requestId,
    );
    return c.json({ ok: true });
  });
