import { mediaAssets } from '@hantex/db/worker';
import { and, desc, eq, ilike, lt, sum } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import { badRequest, conflict, notFound } from '../lib/errors';
import { mediaKey } from '../lib/media-store';
import { validate } from '../lib/validate';
import { readWebp } from '../lib/webp';
import { requirePermission } from '../middleware/session';

/**
 * The media library (D-044). The dashboard resizes each image in the browser and uploads a few
 * WebP widths; this API checks every file again (real WebP by its bytes, sizes consistent, within
 * limits and the site's quota) and keeps them in the site's private storage. The dashboard shows
 * them through this API only; they become public when published content uses them.
 */

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_VARIANTS = 4;
const MAX_SIDE = 4096;

const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });
const idParam = validate('param', z.object({ id: z.uuid() }));
const bilingual = z.strictObject({
  ar: z.string().trim().max(250),
  en: z.string().trim().max(250),
});

const metaSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  alt: bilingual,
});

export interface Variant {
  width: number;
  height: number;
  bytes: number;
}

const quotaBytes = (env: AppEnv['Bindings']) => {
  const mb = Number(env.MEDIA_SITE_QUOTA_MB ?? 1024);
  return (Number.isFinite(mb) && mb > 0 ? mb : 1024) * 1024 * 1024;
};

const asItem = (siteKey: string, row: typeof mediaAssets.$inferSelect) => ({
  id: row.id,
  name: row.name,
  alt: row.alt as { ar: string; en: string },
  width: row.width,
  height: row.height,
  bytes: row.bytes,
  variants: row.variants as Variant[],
  createdAt: row.createdAt,
  published: row.publishedAt !== null,
  // Served by this API to signed-in staff only.
  urls: Object.fromEntries(
    (row.variants as Variant[]).map((v) => [
      v.width,
      `/api/sites/${encodeURIComponent(siteKey)}/media/${row.id}/${v.width}.webp`,
    ]),
  ),
});

export const mediaRoutes = new Hono<AppEnv>()
  .get(
    '/',
    requirePermission('media.view'),
    validate(
      'query',
      z.strictObject({
        q: z.string().trim().max(100).optional(),
        before: z.iso.datetime().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(48),
      }),
    ),
    async (c) => {
      const v = c.var;
      const { q, before, limit } = c.req.valid('query');
      const rows = await v.db
        .select()
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.siteId, v.site.id),
            q ? ilike(mediaAssets.name, `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`) : undefined,
            before ? lt(mediaAssets.createdAt, new Date(before)) : undefined,
          ),
        )
        .orderBy(desc(mediaAssets.createdAt))
        .limit(limit);
      const [usage] = await v.db
        .select({ bytes: sum(mediaAssets.bytes) })
        .from(mediaAssets)
        .where(eq(mediaAssets.siteId, v.site.id));
      return c.json({
        items: rows.map((row) => asItem(v.site.key, row)),
        next: rows.length === limit ? (rows.at(-1)?.createdAt ?? null) : null,
        usedBytes: Number(usage?.bytes ?? 0),
        quotaBytes: quotaBytes(c.env),
      });
    },
  )

  /** multipart/form-data: `meta` (JSON: name, alt) and one WebP file per width, `w<width>`. */
  .post('/', requirePermission('media.edit'), async (c) => {
    const v = c.var;
    const form = await c.req.formData().catch(() => null);
    if (!form) throw badRequest('invalid-input');
    const rawMeta = form.get('meta');
    let parsedMeta: unknown;
    try {
      parsedMeta = typeof rawMeta === 'string' ? (JSON.parse(rawMeta) as unknown) : null;
    } catch {
      parsedMeta = null;
    }
    const meta = metaSchema.safeParse(parsedMeta);
    if (!meta.success) throw badRequest('invalid-input');

    const files: { width: number; height: number; data: ArrayBuffer }[] = [];
    for (const [field, value] of form.entries()) {
      if (field === 'meta') continue;
      const match = /^w(\d{1,4})$/.exec(field);
      if (!match || typeof value === 'string') throw badRequest('invalid-media');
      if (value.size > MAX_FILE_BYTES) throw badRequest('media-too-large');
      const data = await value.arrayBuffer();
      const info = readWebp(data);
      if (!info || info.width !== Number(match[1])) throw badRequest('invalid-media');
      if (info.width > MAX_SIDE || info.height > MAX_SIDE) throw badRequest('media-too-large');
      files.push({ ...info, data });
    }
    if (files.length === 0 || files.length > MAX_VARIANTS) throw badRequest('invalid-media');
    files.sort((a, b) => a.width - b.width);
    if (new Set(files.map((f) => f.width)).size !== files.length) throw badRequest('invalid-media');
    // Every width is the same picture: the same shape, within rounding.
    const largest = files.at(-1)!;
    const ratio = largest.width / largest.height;
    if (files.some((f) => Math.abs(f.width / f.height - ratio) > 0.02 * ratio)) {
      throw badRequest('invalid-media');
    }

    const bytes = files.reduce((total, f) => total + f.data.byteLength, 0);
    const [usage] = await v.db
      .select({ bytes: sum(mediaAssets.bytes) })
      .from(mediaAssets)
      .where(eq(mediaAssets.siteId, v.site.id));
    if (Number(usage?.bytes ?? 0) + bytes > quotaBytes(c.env)) throw conflict('media-quota');

    const id = crypto.randomUUID();
    const store = v.deps.media(c.env);
    for (const file of files) {
      await store.put(mediaKey('private', v.site.id, id, file.width), file.data, 'image/webp');
    }
    await v.db.insert(mediaAssets).values({
      id,
      siteId: v.site.id,
      name: meta.data.name,
      alt: meta.data.alt,
      width: largest.width,
      height: largest.height,
      variants: files.map(({ width, height, data }) => ({ width, height, bytes: data.byteLength })),
      bytes,
      createdBy: v.access.userId,
    });
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'media.uploaded',
        siteId: v.site.id,
        targetType: 'media',
        targetId: id,
        details: { name: meta.data.name, bytes },
      },
      v.requestId,
    );
    return c.json({ id }, 201);
  })

  .get(
    '/:id/:file{[0-9]{2,4}\\.webp}',
    requirePermission('media.view'),
    validate('param', z.object({ id: z.uuid(), file: z.string() })),
    async (c) => {
      const v = c.var;
      const { id, file } = c.req.valid('param');
      const width = Number(file.slice(0, -5));
      const [row] = await v.db
        .select({ variants: mediaAssets.variants })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.id, id), eq(mediaAssets.siteId, v.site.id)));
      if (!row || !(row.variants as Variant[]).some((x) => x.width === width)) throw notFound();
      const stored = await v.deps.media(c.env).get(mediaKey('private', v.site.id, id, width));
      if (!stored) throw notFound();
      return new Response(stored.body, {
        headers: {
          'Content-Type': 'image/webp',
          'Content-Length': String(stored.size),
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    },
  )

  .patch(
    '/:id',
    requirePermission('media.edit'),
    idParam,
    validate('json', metaSchema.partial()),
    async (c) => {
      const v = c.var;
      const { id } = c.req.valid('param');
      const changes = c.req.valid('json');
      const [updated] = await v.db
        .update(mediaAssets)
        .set(changes)
        .where(and(eq(mediaAssets.id, id), eq(mediaAssets.siteId, v.site.id)))
        .returning();
      if (!updated) throw notFound();
      return c.json(asItem(v.site.key, updated));
    },
  )

  .delete('/:id', requirePermission('media.delete'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const [row] = await v.db
      .delete(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.siteId, v.site.id)))
      .returning();
    if (!row) throw notFound();
    const widths = (row.variants as Variant[]).map((x) => x.width);
    await v.deps
      .media(c.env)
      .delete(
        widths.flatMap((w) => [
          mediaKey('private', v.site.id, id, w),
          mediaKey('public', v.site.id, id, w),
        ]),
      );
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'media.deleted',
        siteId: v.site.id,
        targetType: 'media',
        targetId: id,
        details: { name: row.name },
      },
      v.requestId,
    );
    return c.json({ ok: true });
  });
