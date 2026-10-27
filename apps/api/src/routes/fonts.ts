import { fonts, users } from '@hantex/db/worker';
import { uploadedFontId } from '@hantex/theme';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { sitesUsingFont, type FontFile } from '../lib/fonts';
import { fontKey } from '../lib/media-store';
import { validate } from '../lib/validate';
import { FONT_MAX_BYTES, readWoff2, type FontInfo } from '../lib/woff2';
import { requirePlatformPermission } from '../middleware/session';

/**
 * Uploaded fonts (D-033), shared by every website. The Owner uploads a family's WOFF2 files (one
 * per weight) and confirms its licence; each file is read and checked here before anything is
 * stored, and its name, weight and scripts come from the file itself. Staff who style a site can
 * list the fonts and load them for previews.
 */

const MAX_FILES = 9;
const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });
const idParam = validate('param', z.object({ id: z.uuid() }));

const metaSchema = z.strictObject({
  licence: z.strictObject({
    name: z.string().trim().min(2).max(120),
    url: z
      .url({ protocol: /^https$/ })
      .max(500)
      .nullable(),
  }),
  /** The Owner confirms the licence allows using the font on websites. */
  confirmed: z.literal(true),
});

/** Anyone who styles a site, or manages fonts, may see the library. */
function requireFontAccess(v: AppEnv['Variables']) {
  const styles = v.access.assignments.some((a) =>
    (v.access.rolePermissions.get(a.roleId) ?? []).includes('appearance.edit'),
  );
  if (!styles && !v.access.platform.has('fonts.manage')) throw forbidden('missing-permission');
}

const asItem = (row: typeof fonts.$inferSelect & { confirmedBy: string | null }) => ({
  id: uploadedFontId(row.id),
  uuid: row.id,
  name: row.family,
  scripts: row.scripts,
  files: (row.files as FontFile[]).map((f) => ({
    ...f,
    url: `/api/fonts/${row.id}/${f.weight}.woff2`,
  })),
  licence: row.licence as { name: string; url: string | null },
  licenceConfirmedAt: row.licenceConfirmedAt,
  licenceConfirmedBy: row.confirmedBy,
  createdAt: row.createdAt,
});

export const fontRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const v = c.var;
    requireFontAccess(v);
    const rows = await v.db
      .select({ font: fonts, confirmedBy: users.email })
      .from(fonts)
      .leftJoin(users, eq(users.id, fonts.licenceConfirmedBy))
      .orderBy(desc(fonts.createdAt));
    return c.json(rows.map(({ font, confirmedBy }) => asItem({ ...font, confirmedBy })));
  })

  /** multipart/form-data: `meta` (JSON: licence, confirmed) and up to nine WOFF2 files. */
  .post(
    '/',
    requirePlatformPermission('fonts.manage'),
    bodyLimit({
      maxSize: MAX_FILES * FONT_MAX_BYTES + 64 * 1024,
      onError: () => {
        throw badRequest('font-too-large');
      },
    }),
    async (c) => {
      const v = c.var;
      const form = await c.req.formData().catch(() => null);
      if (!form) throw badRequest('invalid-input');
      const rawMeta = form.get('meta');
      let parsedMeta: unknown = null;
      try {
        parsedMeta = typeof rawMeta === 'string' ? (JSON.parse(rawMeta) as unknown) : null;
      } catch {
        // Reported below.
      }
      const meta = metaSchema.safeParse(parsedMeta);
      if (!meta.success) throw badRequest('invalid-input');

      const files: (FontInfo & { data: ArrayBuffer })[] = [];
      for (const [field, value] of form.entries()) {
        if (field === 'meta') continue;
        if (field !== 'file' || typeof value === 'string') throw badRequest('invalid-font');
        if (files.length === MAX_FILES) throw badRequest('font-too-many-files');
        if (value.size > FONT_MAX_BYTES) throw badRequest('font-too-large');
        const data = await value.arrayBuffer();
        const result = readWoff2(data);
        if (!result.ok) throw badRequest('invalid-font', { reason: result.reason });
        files.push({ ...result.info, data });
      }
      if (files.length === 0) throw badRequest('invalid-font', { reason: 'not-woff2' });
      // One family, upright, one file per weight.
      const family = files[0]!.family;
      if (!/^[\p{L}\p{N} '._-]{1,80}$/u.test(family)) {
        throw badRequest('invalid-font', { reason: 'malformed' });
      }
      if (files.some((f) => f.family !== family)) throw badRequest('font-mixed-families');
      if (files.some((f) => f.italic)) throw badRequest('font-italic');
      if (new Set(files.map((f) => f.weight)).size !== files.length) {
        throw badRequest('font-duplicate-weight');
      }
      // The family writes a script only if every weight does.
      const scripts = (['latin', 'arabic'] as const).filter((s) =>
        files.every((f) => f.scripts.includes(s)),
      );
      if (scripts.length === 0) throw badRequest('font-scripts-differ');
      files.sort((a, b) => a.weight - b.weight);

      const id = crypto.randomUUID();
      const store = v.deps.publicMedia(c.env);
      for (const file of files) await store.put(fontKey(id, file.weight), file.data, 'font/woff2');
      const confirmedAt = new Date();
      await v.db.insert(fonts).values({
        id,
        family,
        scripts,
        files: files.map((f) => ({ weight: f.weight, bytes: f.data.byteLength })),
        licence: meta.data.licence,
        licenceConfirmedBy: v.access.userId,
        licenceConfirmedAt: confirmedAt,
      });
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'font.uploaded',
          targetType: 'font',
          targetId: id,
          details: {
            family,
            weights: files.map((f) => f.weight),
            licence: meta.data.licence.name,
          },
        },
        v.requestId,
      );
      return c.json({ id: uploadedFontId(id) }, 201);
    },
  )

  /** A font file, for previews in the dashboard. */
  .get(
    '/:id/:file{[1-9]00\\.woff2}',
    validate('param', z.object({ id: z.uuid(), file: z.string() })),
    async (c) => {
      const v = c.var;
      requireFontAccess(v);
      const { id, file } = c.req.valid('param');
      const weight = Number(file.slice(0, 3));
      const [row] = await v.db.select({ files: fonts.files }).from(fonts).where(eq(fonts.id, id));
      if (!row || !(row.files as FontFile[]).some((f) => f.weight === weight)) throw notFound();
      const stored = await v.deps.publicMedia(c.env).get(fontKey(id, weight));
      if (!stored) throw notFound();
      return new Response(stored.body, {
        headers: {
          'Content-Type': 'font/woff2',
          'Content-Length': String(stored.size),
          'Cache-Control': 'private, max-age=86400, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    },
  )

  .delete('/:id', requirePlatformPermission('fonts.manage'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const [row] = await v.db.select().from(fonts).where(eq(fonts.id, id));
    if (!row) throw notFound();
    const used = await sitesUsingFont(v.db, id);
    if (used.length > 0) throw conflict('font-in-use', { sites: used.length });
    await v.db.delete(fonts).where(eq(fonts.id, id));
    await v.deps
      .publicMedia(c.env)
      .delete((row.files as FontFile[]).map((f) => fontKey(id, f.weight)));
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'font.deleted', targetType: 'font', targetId: id, details: { family: row.family } },
      v.requestId,
    );
    return c.json({ ok: true });
  });
