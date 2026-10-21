import { sites, themePresets } from '@hantex/db/worker';
import { BUILT_IN_PRESETS, themeSchema, validateTheme } from '@hantex/theme';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { coversSite, permissionsOn } from '../lib/access';
import { writeAudit } from '../lib/audit';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { publishedTheme } from '../lib/presets';
import { validate } from '../lib/validate';
import { requirePlatformPermission } from '../middleware/session';

const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });

/** Does the person hold this permission on at least one site? */
const onAnySite = (v: AppEnv['Variables'], permission: 'appearance.edit' | 'appearance.publish') =>
  v.access.assignments.some((a) =>
    (v.access.rolePermissions.get(a.roleId) ?? []).includes(permission),
  );

/**
 * Theme presets (D-027), shared by all sites: the built-in starting themes, saved presets, and
 * the published themes of the sites the person may style, so a theme can be copied across sites.
 */
export const presetRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const v = c.var;
    if (!onAnySite(v, 'appearance.edit') && !v.access.platform.has('sites.manage')) {
      throw forbidden('missing-permission');
    }
    const saved = await v.db.select().from(themePresets).orderBy(desc(themePresets.createdAt));
    const allSites = await v.db.select().from(sites).orderBy(sites.createdAt);
    const styled = allSites.filter(
      (s) =>
        coversSite(v.access, s.id) &&
        (permissionsOn(v.access, s.id).has('appearance.edit') ||
          v.access.platform.has('sites.manage')),
    );
    return c.json({
      builtIn: BUILT_IN_PRESETS.map((p) => ({ id: p.id, name: p.name, theme: p.theme })),
      saved: saved.map((p) => ({ id: p.id, name: { ar: p.nameAr, en: p.nameEn }, theme: p.data })),
      sites: await Promise.all(
        styled.map(async (s) => ({
          key: s.key,
          name: { ar: s.nameAr, en: s.nameEn },
          theme: await publishedTheme(v.db, s.id),
        })),
      ),
    });
  })

  .post(
    '/',
    validate(
      'json',
      z.strictObject({
        name: z.strictObject({
          ar: z.string().trim().min(1).max(60),
          en: z.string().trim().min(1).max(60),
        }),
        theme: themeSchema,
      }),
    ),
    async (c) => {
      const v = c.var;
      if (!onAnySite(v, 'appearance.publish')) throw forbidden('missing-permission');
      const body = c.req.valid('json');
      const { errors } = validateTheme(body.theme);
      if (errors.length > 0) throw badRequest('theme-contrast', { errors });
      const [preset] = await v.db
        .insert(themePresets)
        .values({
          nameAr: body.name.ar,
          nameEn: body.name.en,
          data: body.theme,
          createdBy: v.access.userId,
        })
        .returning({ id: themePresets.id });
      await writeAudit(
        v.db,
        auditActor(v),
        { action: 'theme-preset.created', targetType: 'theme-preset', targetId: preset?.id ?? '' },
        v.requestId,
      );
      return c.json({ id: preset?.id }, 201);
    },
  )

  .delete(
    '/:id',
    requirePlatformPermission('sites.manage'),
    validate('param', z.object({ id: z.uuid() })),
    async (c) => {
      const v = c.var;
      const [row] = await v.db
        .delete(themePresets)
        .where(eq(themePresets.id, c.req.valid('param').id))
        .returning({ id: themePresets.id });
      if (!row) throw notFound();
      await writeAudit(
        v.db,
        auditActor(v),
        { action: 'theme-preset.deleted', targetType: 'theme-preset', targetId: row.id },
        v.requestId,
      );
      return c.json({ ok: true });
    },
  );
