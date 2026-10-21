import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { DOCUMENTS, currentDraft, latestPublished } from '../lib/documents';
import { forbidden } from '../lib/errors';
import { signPreview } from '../lib/preview';
import { validate } from '../lib/validate';

/**
 * Signs the page data for a preview the public site renders with its real components. Drafts are
 * included only for kinds the staff member may view; everything else is the published version.
 */
export const previewRoutes = new Hono<AppEnv>().post(
  '/',
  validate(
    'json',
    z.strictObject({
      drafts: z.strictObject({ 'coming-soon': z.boolean(), 'site-settings': z.boolean(), theme: z.boolean() }),
    }),
  ),
  async (c) => {
    const v = c.var;
    const { drafts } = c.req.valid('json');
    const data: Record<string, unknown> = {};
    for (const kind of ['coming-soon', 'site-settings', 'theme'] as const) {
      if (drafts[kind]) {
        if (!DOCUMENTS[kind].view.every((p) => v.access.permissions.has(p))) throw forbidden('missing-permission');
        data[kind] = (await currentDraft(v.db, kind)).data;
      } else {
        data[kind] = (await latestPublished(v.db, kind))?.data ?? DOCUMENTS[kind].defaults;
      }
    }
    const fields = await signPreview(c.env.PREVIEW_SIGNING_SECRET, data);
    return c.json({ action: `${c.env.PUBLIC_SITE_ORIGIN}/preview`, fields });
  },
);
