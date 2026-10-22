import { optionalHttpsUrl } from '@hantex/shared';
import { z } from 'zod';

/** Text both languages can fill; empty text hides that element in that language. */
export const text = (max: number) => z.string().trim().max(max);
export const bilingual = (max: number) => z.strictObject({ ar: text(max), en: text(max) });
export type Bilingual = { ar: string; en: string };
export const emptyText = (): Bilingual => ({ ar: '', en: '' });

/** Short identifiers for pages, sections and menu items, made by the dashboard. */
export const itemId = z.string().regex(/^[a-z0-9]{6,24}$/, 'Not a valid identifier');

/** The last part of a page's address: lowercase Latin letters, digits and hyphens. */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens');

/** Addresses the platform itself uses; no page may take them. */
export const RESERVED_SLUGS = [
  'ar',
  'en',
  'api',
  'preview',
  'brand',
  'fonts',
  'media',
  'robots.txt',
  'sitemap.xml',
  '404',
  '_astro',
] as const;

/** Where a button or menu item leads. */
export const linkSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('none') }),
  z.strictObject({ type: z.literal('page'), pageId: itemId }),
  z.strictObject({
    type: z.literal('url'),
    url: optionalHttpsUrl.refine((v) => v !== '', 'Required'),
  }),
  z.strictObject({ type: z.literal('section'), anchor: slugSchema }),
]);
export type Link = z.infer<typeof linkSchema>;

/** Icons the sites can draw. */
export const ICONS = [
  'switch',
  'socket',
  'lighting',
  'lamp',
  'accessory',
  'other',
  'check',
  'mail',
  'phone',
  'whatsapp',
  'pin',
  'clock',
  'globe',
  'bell',
] as const;
export type IconName = (typeof ICONS)[number];
