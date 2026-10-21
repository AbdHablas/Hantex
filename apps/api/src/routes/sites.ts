import { documentDrafts, publishJobs, siteDomains, sites } from '@hantex/db/worker';
import { LOCALES, SITE_MODES, hostnameSchema, newSiteSchema } from '@hantex/shared';
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { coversSite } from '../lib/access';
import { writeAudit } from '../lib/audit';
import { badRequest, conflict, notFound } from '../lib/errors';
import { presetTheme, publishedTheme, siteIdByKey } from '../lib/presets';
import { notifyOwners } from '../lib/staff';
import { validate } from '../lib/validate';
import { requirePermission, requirePlatformPermission } from '../middleware/session';

const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });

const isUniqueViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === '23505';

/** Platform routes: the sites this person can open, and creating a site (Owner only, D-024). */
export const sitesRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await c.var.db.select().from(sites).orderBy(sites.createdAt);
    return c.json(
      rows
        .filter((s) => coversSite(c.var.access, s.id))
        .map((s) => ({
          key: s.key,
          name: { ar: s.nameAr, en: s.nameEn },
          locales: s.locales,
          defaultLocale: s.defaultLocale,
          mode: s.mode,
          template: s.template,
          archived: s.archivedAt !== null,
        })),
    );
  })

  .post(
    '/',
    requirePlatformPermission('sites.manage'),
    validate('json', newSiteSchema),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      // The starting theme is resolved first so an unknown preset or site creates nothing.
      let startTheme: unknown = null;
      if (body.startTheme && 'preset' in body.startTheme) {
        startTheme = await presetTheme(v.db, body.startTheme.preset);
        if (!startTheme) throw badRequest('unknown-preset');
      } else if (body.startTheme) {
        const sourceId = await siteIdByKey(v.db, body.startTheme.site);
        if (!sourceId || !coversSite(v.access, sourceId)) throw badRequest('unknown-site');
        startTheme = await publishedTheme(v.db, sourceId);
      }
      // New sites always start in Coming Soon mode (the column default), whatever is sent.
      const [site] = await v.db
        .insert(sites)
        .values({
          key: body.key,
          nameAr: body.name.ar,
          nameEn: body.name.en,
          locales: body.locales,
          defaultLocale: body.defaultLocale,
          template: body.template,
          createdBy: v.access.userId,
        })
        .onConflictDoNothing({ target: sites.key })
        .returning({ id: sites.id });
      if (!site) throw conflict('site-key-in-use');
      // A starting theme becomes the new site's theme draft, to review and publish as usual.
      if (startTheme) {
        await v.db
          .insert(documentDrafts)
          .values({ siteId: site.id, kind: 'theme', data: startTheme, updatedBy: v.access.userId });
      }
      await writeAudit(
        v.db,
        auditActor(v),
        { action: 'site.created', siteId: site.id, targetType: 'site', targetId: body.key },
        v.requestId,
      );
      await notifyOwners(c, {
        ar: `إنشاء موقع جديد «${body.name.ar}»`,
        en: `created a new site, ${body.name.en}`,
      });
      return c.json({ key: body.key }, 201);
    },
  );

/**
 * One site's configuration (mounted under the site's routes, after withSite). Editing, domains
 * and archiving need the Owner-only sites.manage; the mode needs siteMode.manage on the site.
 */
export const siteConfigRoutes = new Hono<AppEnv>()
  .get('/', requirePermission('dashboard.view'), async (c) => {
    const s = c.var.site;
    const domains = await c.var.db
      .select({
        id: siteDomains.id,
        hostname: siteDomains.hostname,
        isPrimary: siteDomains.isPrimary,
        status: siteDomains.status,
      })
      .from(siteDomains)
      .where(and(eq(siteDomains.siteId, s.id), ne(siteDomains.status, 'removed')));
    return c.json({
      key: s.key,
      name: { ar: s.nameAr, en: s.nameEn },
      locales: s.locales,
      defaultLocale: s.defaultLocale,
      mode: s.mode,
      template: s.template,
      archived: s.archivedAt !== null,
      domains,
    });
  })

  .patch(
    '/',
    requirePlatformPermission('sites.manage'),
    validate(
      'json',
      z
        .strictObject({
          name: z
            .strictObject({
              ar: z.string().trim().min(1).max(80),
              en: z.string().trim().min(1).max(80),
            })
            .optional(),
          locales: z.array(z.enum(LOCALES)).min(1).max(LOCALES.length).optional(),
          defaultLocale: z.enum(LOCALES).optional(),
        })
        .refine((b) => !b.locales || new Set(b.locales).size === b.locales.length, {
          path: ['locales'],
        }),
    ),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      const locales = body.locales ?? v.site.locales;
      const defaultLocale = body.defaultLocale ?? v.site.defaultLocale;
      if (!locales.includes(defaultLocale)) throw badRequest('default-locale-not-in-locales');
      await v.db
        .update(sites)
        .set({
          ...(body.name ? { nameAr: body.name.ar, nameEn: body.name.en } : {}),
          locales,
          defaultLocale,
          updatedAt: new Date(),
        })
        .where(eq(sites.id, v.site.id));
      await writeAudit(
        v.db,
        auditActor(v),
        { action: 'site.updated', siteId: v.site.id, details: { fields: Object.keys(body) } },
        v.requestId,
      );
      return c.json({ ok: true });
    },
  )

  /** Switching mode (Coming Soon, live, maintenance) rebuilds the site; Owner only. */
  .put(
    '/mode',
    requirePermission('siteMode.manage'),
    validate('json', z.strictObject({ mode: z.enum(SITE_MODES) })),
    async (c) => {
      const v = c.var;
      const { mode } = c.req.valid('json');
      if (mode === v.site.mode) return c.json({ ok: true, changed: false });
      await v.db.update(sites).set({ mode, updatedAt: new Date() }).where(eq(sites.id, v.site.id));
      const [job] = await v.db
        .insert(publishJobs)
        .values({ siteId: v.site.id, requestedBy: v.access.userId })
        .returning({ id: publishJobs.id });
      const result = job
        ? await v.deps.publisher(c.env).dispatch({ jobId: job.id, siteKey: v.site.key })
        : { dispatched: false, detail: 'no-job' };
      if (job) {
        await v.db
          .update(publishJobs)
          .set({ status: result.dispatched ? 'dispatched' : 'failed', detail: result.detail })
          .where(eq(publishJobs.id, job.id));
      }
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'site.mode.changed',
          siteId: v.site.id,
          details: { from: v.site.mode, to: mode, build: result.detail },
        },
        v.requestId,
      );
      await notifyOwners(c, {
        ar: `تغيير وضع موقع «${v.site.nameAr}» إلى ${mode}`,
        en: `switched ${v.site.nameEn} to ${mode} mode`,
      });
      return c.json({ ok: true, changed: true, job: job ? { id: job.id, ...result } : null });
    },
  )

  /**
   * Records a domain as pending. It is connected only by a production deployment the Owner
   * approves (docs/deployment.md); the dashboard never changes DNS.
   */
  .post(
    '/domains',
    requirePlatformPermission('sites.manage'),
    validate(
      'json',
      z.strictObject({ hostname: hostnameSchema, isPrimary: z.boolean().default(false) }),
    ),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      try {
        const [domain] = await v.db
          .insert(siteDomains)
          .values({ siteId: v.site.id, hostname: body.hostname, isPrimary: body.isPrimary })
          .returning({ id: siteDomains.id });
        await writeAudit(
          v.db,
          auditActor(v),
          {
            action: 'site.domain.added',
            siteId: v.site.id,
            targetType: 'domain',
            targetId: body.hostname,
          },
          v.requestId,
        );
        return c.json({ id: domain?.id, status: 'pending' }, 201);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict(body.isPrimary ? 'domain-or-primary-in-use' : 'domain-in-use');
        }
        throw error;
      }
    },
  )

  /** Removes a pending domain. An active one needs a deployment the Owner approves. */
  .delete(
    '/domains/:id',
    requirePlatformPermission('sites.manage'),
    validate('param', z.object({ siteKey: z.string(), id: z.uuid() })),
    async (c) => {
      const v = c.var;
      const [domain] = await v.db
        .select()
        .from(siteDomains)
        .where(
          and(
            eq(siteDomains.id, c.req.valid('param').id),
            eq(siteDomains.siteId, v.site.id),
            ne(siteDomains.status, 'removed'),
          ),
        );
      if (!domain) throw notFound();
      if (domain.status === 'active') throw conflict('active-domain-needs-deployment');
      await v.db
        .update(siteDomains)
        .set({ status: 'removed', updatedAt: new Date() })
        .where(eq(siteDomains.id, domain.id));
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'site.domain.removed',
          siteId: v.site.id,
          targetType: 'domain',
          targetId: domain.hostname,
        },
        v.requestId,
      );
      return c.json({ ok: true });
    },
  )

  /** Archiving keeps every record; the public site is taken down by an approved deployment. */
  .post('/archive', requirePlatformPermission('sites.manage'), async (c) => {
    const v = c.var;
    await v.db
      .update(sites)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(sites.id, v.site.id));
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'site.archived', siteId: v.site.id },
      v.requestId,
    );
    await notifyOwners(c, {
      ar: `أرشفة موقع «${v.site.nameAr}»`,
      en: `archived ${v.site.nameEn}`,
    });
    return c.json({ ok: true });
  })

  .post('/restore', requirePlatformPermission('sites.manage'), async (c) => {
    const v = c.var;
    if (!v.site.archivedAt) return c.json({ ok: true });
    await v.db
      .update(sites)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(sites.id, v.site.id));
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'site.restored', siteId: v.site.id },
      v.requestId,
    );
    return c.json({ ok: true });
  });
