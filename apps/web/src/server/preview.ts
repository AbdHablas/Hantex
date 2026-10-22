import {
  itemId,
  layoutSchema,
  menusSchema,
  pageSchema,
  pagesIndexSchema,
  savedSectionsSchema,
} from '@hantex/sections';
import { LOCALES, comingSoonSchema, siteSettingsSchema } from '@hantex/shared';
import { themeSchema } from '@hantex/theme';
import { z } from 'zod';
import { hmacHex, timingSafeEqual } from './crypto';

/**
 * Draft previews (apps/api/src/routes/preview.ts): the dashboard signs the page data with a
 * secret shared only with the site Workers. The payload names the site, expires after a few
 * minutes, and is re-validated with the same schemas as published content.
 */
const payloadSchema = z.object({
  site: z.string(),
  data: z.object({
    'coming-soon': comingSoonSchema,
    'site-settings': siteSettingsSchema,
    theme: themeSchema,
    /** Pages, menus and layout (D-035), when a page is previewed. */
    builder: z
      .object({
        index: pagesIndexSchema,
        pages: z.record(itemId, pageSchema),
        menus: menusSchema,
        layout: layoutSchema,
        saved: savedSectionsSchema.optional(),
      })
      .optional(),
    page: z.object({ id: itemId, locale: z.enum(LOCALES) }).optional(),
  }),
});

export type PreviewData = z.infer<typeof payloadSchema>['data'];

const fromBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
  return new TextDecoder().decode(bytes);
};

export async function verifyPreview(
  secret: string,
  fields: { payload: string; expires: string; signature: string },
  siteKey: string,
  now = Date.now(),
): Promise<PreviewData | null> {
  if (!secret || fields.payload.length > 200_000) return null;
  const expires = Number(fields.expires);
  if (!Number.isInteger(expires) || expires * 1000 < now) return null;
  const expected = await hmacHex(secret, `${fields.payload}.${fields.expires}`);
  if (!timingSafeEqual(fields.signature, expected)) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(fromBase64Url(fields.payload)));
    if (!parsed.success || parsed.data.site !== siteKey) return null;
    return parsed.data.data;
  } catch {
    return null;
  }
}

/**
 * Who may show a preview in a frame: only the dashboard's own origin (its device preview), from
 * the Worker's DASHBOARD_ORIGIN variable. Anything that isn't a plain https origin is ignored.
 */
export function frameAncestors(dashboardOrigin: string | undefined): string {
  if (!dashboardOrigin) return "'none'";
  try {
    const url = new URL(dashboardOrigin);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol === 'https:' || local) && url.origin === dashboardOrigin) return url.origin;
  } catch {
    // fall through
  }
  return "'none'";
}
