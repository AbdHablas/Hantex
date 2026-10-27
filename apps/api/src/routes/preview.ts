import { siteDomains } from '@hantex/db/worker';
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { itemId, mediaIds } from '@hantex/sections';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { DOCUMENTS, KINDS, currentDraft, latestPublished } from '../lib/documents';
import { conflict, forbidden, notFound } from '../lib/errors';
import { draftContent, publishedContent } from '../lib/site-content';
import { previewMedia } from '../lib/media-library';
import { PREVIEW_TTL_SECONDS, signPreview } from '../lib/preview';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/session';

/**
 * Signs one site's page data for a preview that the site's own Worker renders with its real
 * components. Drafts are included only for kinds the staff member may view on this site;
 * everything else is the published version. The signed payload names the site, so a preview
 * can't be replayed on another site.
 */
export const previewRoutes = new Hono<AppEnv>().post(
  '/',
  requirePermission('dashboard.view'),
  validate(
    'json',
    z.strictObject({
      drafts: z.strictObject({
        'coming-soon': z.boolean(),
        'site-settings': z.boolean(),
        theme: z.boolean(),
        /** Pages, menus and layout (D-035). */
        builder: z.boolean().optional(),
      }),
      /** Show this page of the website instead of the Coming Soon page. */
      page: itemId.optional(),
      locale: z.enum(['ar', 'en']).optional(),
    }),
  ),
  async (c) => {
    const v = c.var;
    const { drafts, page, locale } = c.req.valid('json');
    const [primary] = await v.db
      .select({ hostname: siteDomains.hostname })
      .from(siteDomains)
      .where(
        and(
          eq(siteDomains.siteId, v.site.id),
          eq(siteDomains.isPrimary, true),
          ne(siteDomains.status, 'removed'),
        ),
      );
    if (!primary) throw conflict('site-has-no-domain');

    const data: Record<string, unknown> = {};
    for (const kind of KINDS) {
      if (drafts[kind]) {
        if (!DOCUMENTS[kind].view.every((p) => v.permissions.has(p))) {
          throw forbidden('missing-permission');
        }
        data[kind] = (await currentDraft(v.db, v.site.id, kind)).data;
      } else {
        data[kind] =
          (await latestPublished(v.db, v.site.id, kind))?.data ?? DOCUMENTS[kind].defaults;
      }
    }
    if (drafts.builder || page) {
      if (drafts.builder && !v.permissions.has('pages.view')) throw forbidden('missing-permission');
      const content = drafts.builder
        ? await draftContent(v.db, v.site.id)
        : await publishedContent(v.db, v.site.id);
      if (page && !content.pages.has(page)) throw notFound();
      // Only the page shown carries its sections; the others are outlines for links and menus,
      // which keeps the signed form small however many pages the site has.
      data['builder'] = {
        index: content.index,
        pages: Object.fromEntries(
          [...content.pages].map(([id, p]) => [id, id === page ? p : { ...p, sections: [] }]),
        ),
        menus: content.menus,
        layout: content.layout,
        saved: content.saved,
      };
      if (page) data['page'] = { id: page, locale: locale ?? v.site.defaultLocale };
      // The images the shown page uses, with signed links to copies of unpublished ones.
      data['media'] = await previewMedia(
        v.db,
        { private: v.deps.media(c.env), public: v.deps.publicMedia(c.env) },
        v.site,
        c.env.PREVIEW_SIGNING_SECRET,
        mediaIds([page ? content.pages.get(page) : null, content.saved]),
        Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS,
      );
    }
    const fields = await signPreview(c.env.PREVIEW_SIGNING_SECRET, { site: v.site.key, data });
    return c.json({ action: `https://${primary.hostname}/preview`, fields });
  },
);
