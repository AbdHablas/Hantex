import { siteDomains } from '@hantex/db/worker';
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { DOCUMENTS, KINDS, currentDraft, latestPublished } from '../lib/documents';
import { conflict, forbidden } from '../lib/errors';
import { signPreview } from '../lib/preview';
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
      }),
    }),
  ),
  async (c) => {
    const v = c.var;
    const { drafts } = c.req.valid('json');
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
    const fields = await signPreview(c.env.PREVIEW_SIGNING_SECRET, { site: v.site.key, data });
    return c.json({ action: `https://${primary.hostname}/preview`, fields });
  },
);
