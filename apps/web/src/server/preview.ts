import { comingSoonSchema, siteSettingsSchema } from '@hantex/shared';
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
