import { documentDrafts, documentVersions, users, type DocumentKind } from '@hantex/db/worker';
import {
  checkSite,
  itemId,
  layoutSchema,
  menusSchema,
  newPage,
  pageSchema,
  privacyPolicyDraft,
  savedSectionsSchema,
  slugSchema,
  type Page,
  type PagesIndex,
} from '@hantex/sections';
import type { Permission } from '@hantex/shared';
import { brandTheme, publishable, validateTheme, type Theme } from '@hantex/theme';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import {
  DOCUMENTS,
  currentDraft,
  latestPublished,
  publishVersion,
  saveDraft,
} from '../lib/documents';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { startRebuild } from '../lib/rebuild';
import { draftContent, newRedirects, publishedContent, sameData } from '../lib/site-content';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/session';

/**
 * The website builder (D-035 to D-038): pages and their sections, the page index, menus and the
 * header and footer, all saved as drafts, and *Publish changes*, which validates every changed
 * item of this site and publishes them together with one rebuild (D-037).
 */

const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });
const idParam = validate('param', z.object({ id: itemId }));
const bilingualTitle = z.strictObject({
  ar: z.string().trim().max(120),
  en: z.string().trim().max(120),
});

const has = (v: AppEnv['Variables'], permissions: readonly Permission[]) =>
  permissions.every((p) => v.permissions.has(p));

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

async function indexDraft(v: AppEnv['Variables']) {
  return (await currentDraft(v.db, v.site.id, 'pages')).data as PagesIndex;
}

/** A slug not used by any other page with the same parent. */
async function freeSlug(v: AppEnv['Variables'], base: string, parentId: string | null) {
  const content = await draftContent(v.db, v.site.id);
  const taken = new Set(
    [...content.pages.values()].filter((p) => p.parentId === parentId).map((p) => p.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, 55)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw conflict('slug-taken');
}

/** Every changed item of the site: drafts that differ from their latest published version. */
async function changes(v: AppEnv['Variables']) {
  const draftRows = await v.db
    .select()
    .from(documentDrafts)
    .where(eq(documentDrafts.siteId, v.site.id));
  const items: { kind: DocumentKind; key: string; data: unknown; allowed: boolean }[] = [];
  for (const row of draftRows) {
    const kind = row.kind as DocumentKind;
    const parsed = DOCUMENTS[kind].schema.safeParse(row.data);
    const data = parsed.success ? parsed.data : row.data;
    const published = await latestPublished(v.db, v.site.id, kind, row.key);
    if (published && sameData(published.data, data)) continue;
    items.push({ kind, key: row.key, data, allowed: has(v, DOCUMENTS[kind].publish) });
  }
  return items;
}

export const builderRoutes = new Hono<AppEnv>()
  /* ---------------------------------------------- Pages ---------------------------------------------- */

  .get('/pages', requirePermission('pages.view'), async (c) => {
    const v = c.var;
    const content = await draftContent(v.db, v.site.id);
    const published = await publishedContent(v.db, v.site.id);
    return c.json({
      home: content.index.home,
      pages: content.index.order
        .filter((id) => content.pages.has(id))
        .map((id) => {
          const page = content.pages.get(id) as Page;
          const live = published.pages.get(id);
          return {
            id,
            title: page.title,
            slug: page.slug,
            parentId: page.parentId,
            visible: page.visible,
            sections: page.sections.length,
            published: live !== undefined && published.index.order.includes(id),
            changed: !live || !sameData(live, page),
          };
        }),
    });
  })

  .post(
    '/pages',
    requirePermission('pages.edit'),
    validate(
      'json',
      z.strictObject({
        title: bilingualTitle,
        slug: slugSchema,
        parentId: itemId.nullable().optional(),
        /** Start from a page template: the privacy policy draft for review (D-041). */
        template: z.enum(['privacy-draft']).optional(),
      }),
    ),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      const index = await indexDraft(v);
      if (body.parentId && !index.order.includes(body.parentId)) throw badRequest('unknown-parent');
      if (index.order.length >= 200) throw conflict('too-many-pages');
      const id = newId();
      const slug = await freeSlug(v, body.slug, body.parentId ?? null);
      const page: Page =
        body.template === 'privacy-draft'
          ? {
              ...privacyPolicyDraft({ ar: v.site.nameAr, en: v.site.nameEn }),
              title: body.title,
              slug,
              parentId: body.parentId ?? null,
            }
          : { ...newPage(body.title, slug), parentId: body.parentId ?? null };
      await saveDraft(v.db, v.site.id, 'page', page, v.access.userId, id);
      await saveDraft(
        v.db,
        v.site.id,
        'pages',
        { ...index, order: [...index.order, id], home: index.home ?? id },
        v.access.userId,
      );
      await writeAudit(
        v.db,
        auditActor(v),
        { action: 'page.created', siteId: v.site.id, targetType: 'page', targetId: id },
        v.requestId,
      );
      return c.json({ id, slug: page.slug }, 201);
    },
  )

  .get('/pages/:id', requirePermission('pages.view'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const index = await indexDraft(v);
    if (!index.order.includes(id)) throw notFound();
    const draft = await currentDraft(v.db, v.site.id, 'page', id);
    const published = await latestPublished(v.db, v.site.id, 'page', id);
    return c.json({
      id,
      page: draft.data,
      home: index.home === id,
      draftUpdatedAt: draft.updatedAt,
      published: published
        ? { version: published.version, publishedAt: published.publishedAt }
        : null,
    });
  })

  .put('/pages/:id', requirePermission('pages.edit'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    if (!(await indexDraft(v)).order.includes(id)) throw notFound();
    const parsed = pageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw badRequest('invalid-input', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
      });
    }
    await saveDraft(v.db, v.site.id, 'page', parsed.data, v.access.userId, id);
    return c.json({ ok: true });
  })

  .post('/pages/:id/duplicate', requirePermission('pages.edit'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const index = await indexDraft(v);
    if (!index.order.includes(id)) throw notFound();
    const source = (await currentDraft(v.db, v.site.id, 'page', id)).data as Page;
    const copyId = newId();
    const copy: Page = {
      ...structuredClone(source),
      slug: await freeSlug(v, `${source.slug.slice(0, 50)}-copy`, source.parentId),
      // A copy starts hidden, so it never goes public by accident.
      visible: false,
    };
    await saveDraft(v.db, v.site.id, 'page', copy, v.access.userId, copyId);
    const order = [...index.order];
    order.splice(order.indexOf(id) + 1, 0, copyId);
    await saveDraft(v.db, v.site.id, 'pages', { ...index, order }, v.access.userId);
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'page.duplicated',
        siteId: v.site.id,
        targetType: 'page',
        targetId: copyId,
        details: { from: id },
      },
      v.requestId,
    );
    return c.json({ id: copyId }, 201);
  })

  .delete('/pages/:id', requirePermission('pages.edit'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const index = await indexDraft(v);
    if (!index.order.includes(id)) throw notFound();
    if (index.home === id) throw conflict('cannot-delete-home');
    const content = await draftContent(v.db, v.site.id);
    if ([...content.pages.values()].some((p) => p.parentId === id)) {
      throw conflict('page-has-children');
    }
    // The page leaves the draft index; its published versions stay for history until the next
    // Publish changes removes it from the website.
    await saveDraft(
      v.db,
      v.site.id,
      'pages',
      { ...index, order: index.order.filter((p) => p !== id) },
      v.access.userId,
    );
    await v.db
      .delete(documentDrafts)
      .where(
        and(
          eq(documentDrafts.siteId, v.site.id),
          eq(documentDrafts.kind, 'page'),
          eq(documentDrafts.key, id),
        ),
      );
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'page.deleted', siteId: v.site.id, targetType: 'page', targetId: id },
      v.requestId,
    );
    return c.json({ ok: true });
  })

  .put(
    '/pages-index',
    requirePermission('pages.edit'),
    validate('json', z.strictObject({ order: z.array(itemId).max(200), home: itemId })),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      const index = await indexDraft(v);
      // Reordering never adds or removes pages.
      const same =
        body.order.length === index.order.length &&
        new Set(body.order).size === body.order.length &&
        body.order.every((id) => index.order.includes(id));
      if (!same || !body.order.includes(body.home)) throw badRequest('invalid-order');
      await saveDraft(
        v.db,
        v.site.id,
        'pages',
        { ...index, order: body.order, home: body.home },
        v.access.userId,
      );
      return c.json({ ok: true });
    },
  )

  .get('/pages/:id/versions', requirePermission('pages.view'), idParam, async (c) => {
    const { id } = c.req.valid('param');
    const rows = await c.var.db
      .select({
        version: documentVersions.version,
        publishedAt: documentVersions.publishedAt,
        publishedBy: users.name,
      })
      .from(documentVersions)
      .leftJoin(users, eq(users.id, documentVersions.publishedBy))
      .where(
        and(
          eq(documentVersions.siteId, c.var.site.id),
          eq(documentVersions.kind, 'page'),
          eq(documentVersions.key, id),
        ),
      )
      .orderBy(desc(documentVersions.version))
      .limit(50);
    return c.json(rows);
  })

  /** Restoring a version puts it back into the draft; it goes live with the next Publish changes. */
  .post(
    '/pages/:id/restore',
    requirePermission('pages.edit'),
    idParam,
    validate('json', z.strictObject({ version: z.number().int().positive() })),
    async (c) => {
      const v = c.var;
      const { id } = c.req.valid('param');
      const [row] = await v.db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.siteId, v.site.id),
            eq(documentVersions.kind, 'page'),
            eq(documentVersions.key, id),
            eq(documentVersions.version, c.req.valid('json').version),
          ),
        );
      if (!row) throw notFound();
      const parsed = pageSchema.safeParse(row.data);
      if (!parsed.success) throw conflict('version-incompatible');
      await saveDraft(v.db, v.site.id, 'page', parsed.data, v.access.userId, id);
      const index = await indexDraft(v);
      if (!index.order.includes(id)) {
        await saveDraft(
          v.db,
          v.site.id,
          'pages',
          { ...index, order: [...index.order, id] },
          v.access.userId,
        );
      }
      return c.json({ ok: true });
    },
  )

  /* ------------------------------------------ Menus and layout ------------------------------------------ */

  .get('/menus', requirePermission('pages.view'), async (c) =>
    c.json((await currentDraft(c.var.db, c.var.site.id, 'menus')).data),
  )
  .put('/menus', requirePermission('pages.edit'), validate('json', menusSchema), async (c) => {
    await saveDraft(c.var.db, c.var.site.id, 'menus', c.req.valid('json'), c.var.access.userId);
    return c.json({ ok: true });
  })
  /** Saved sections (D-038): reused by reference on this website's pages. */
  .get('/saved-sections', requirePermission('pages.view'), async (c) =>
    c.json((await currentDraft(c.var.db, c.var.site.id, 'saved-sections')).data),
  )
  .put(
    '/saved-sections',
    requirePermission('pages.edit'),
    validate('json', savedSectionsSchema),
    async (c) => {
      await saveDraft(
        c.var.db,
        c.var.site.id,
        'saved-sections',
        c.req.valid('json'),
        c.var.access.userId,
      );
      return c.json({ ok: true });
    },
  )
  .get('/layout', requirePermission('pages.view'), async (c) =>
    c.json((await currentDraft(c.var.db, c.var.site.id, 'layout')).data),
  )
  .put('/layout', requirePermission('pages.edit'), validate('json', layoutSchema), async (c) => {
    await saveDraft(c.var.db, c.var.site.id, 'layout', c.req.valid('json'), c.var.access.userId);
    return c.json({ ok: true });
  })

  /* ------------------------------------------ Publish changes ------------------------------------------ */

  .get('/changes', requirePermission('dashboard.view'), async (c) => {
    const v = c.var;
    const items = await changes(v);
    const content = await draftContent(v.db, v.site.id);
    return c.json({
      items: items.map(({ kind, key, allowed }) => ({ kind, key, allowed })),
      issues: checkSite({ ...content, locales: v.site.locales }),
    });
  })

  .post(
    '/changes/publish',
    requirePermission('site.publish'),
    validate('json', z.strictObject({ confirmLogoChange: z.boolean().optional() })),
    async (c) => {
      const v = c.var;
      const items = (await changes(v)).filter((item) => item.allowed);
      if (items.length === 0) throw conflict('nothing-to-publish');

      for (const item of items) {
        if (!DOCUMENTS[item.kind].schema.safeParse(item.data).success) {
          throw conflict('draft-invalid', { kind: item.kind, key: item.key });
        }
      }
      const theme = items.find((i) => i.kind === 'theme')?.data as Theme | undefined;
      if (theme) {
        const checks = validateTheme(theme);
        if (!publishable(checks)) throw badRequest('theme-contrast', { errors: checks.errors });
        const offBrand = JSON.stringify(theme.logo) !== JSON.stringify(brandTheme.logo);
        if (offBrand && !v.permissions.has('appearance.editLogo')) {
          throw forbidden('logo-colours-locked');
        }
        if (offBrand && c.req.valid('json').confirmLogoChange !== true) {
          throw conflict('confirm-logo-change');
        }
      }

      const touchesBuilder = items.some((i) =>
        ['page', 'pages', 'menus', 'layout', 'saved-sections'].includes(i.kind),
      );
      let redirects: PagesIndex['redirects'] = [];
      if (touchesBuilder) {
        const next = await draftContent(v.db, v.site.id);
        const issues = checkSite({ ...next, locales: v.site.locales });
        if (issues.length > 0) throw conflict('site-issues', { issues });
        redirects = newRedirects(await publishedContent(v.db, v.site.id), next);
      }

      const published: { kind: string; key: string; version: number }[] = [];
      await v.db.transaction(async (tx) => {
        for (const item of items) {
          let data = item.data;
          // Redirects for changed addresses are recorded on the page index.
          if (item.kind === 'pages' && redirects.length > 0) {
            const index = data as PagesIndex;
            const kept = index.redirects.filter((r) => !redirects.some((n) => n.from === r.from));
            data = { ...index, redirects: [...kept, ...redirects].slice(-500) };
            await saveDraft(tx, v.site.id, 'pages', data, v.access.userId);
          }
          const version = await publishVersion(
            tx,
            v.site.id,
            item.kind,
            data,
            v.access.userId,
            null,
            item.key,
          );
          published.push({ kind: item.kind, key: item.key, version });
        }
        // An address change with no index change still needs its redirect recorded.
        if (redirects.length > 0 && !items.some((i) => i.kind === 'pages')) {
          const index = await indexDraft(v);
          const data = { ...index, redirects: [...index.redirects, ...redirects].slice(-500) };
          await saveDraft(tx, v.site.id, 'pages', data, v.access.userId);
          const version = await publishVersion(tx, v.site.id, 'pages', data, v.access.userId);
          published.push({ kind: 'pages', key: '', version });
        }
      });

      const { job, result } = await startRebuild(c);
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'site.changes-published',
          siteId: v.site.id,
          targetType: 'site',
          targetId: v.site.key,
          details: { items: published, redirects: redirects.length, build: result.detail },
        },
        v.requestId,
      );
      return c.json({
        published,
        job: job ? { id: job.id, dispatched: result.dispatched, detail: result.detail } : null,
      });
    },
  );
