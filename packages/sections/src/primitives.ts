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
  'unsubscribe',
  'brand',
  'fonts',
  'media',
  'files',
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

/** An image from the website's media library (D-044), or null for none yet. */
export const imageRefSchema = z.strictObject({ mediaId: z.uuid() }).nullable();
export type ImageRef = z.infer<typeof imageRefSchema>;

/**
 * What a site needs to draw one media library image: its size, the stored widths and the
 * description in each language. Builds read it from the database; previews receive it signed.
 */
export const mediaInfoSchema = z.strictObject({
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
  widths: z.array(z.number().int().min(10).max(4096)).min(1).max(8),
  alt: bilingual(250),
  /** Previews only: a signed link to a copy of an image that isn't published yet. */
  preview: z.strictObject({ expires: z.number().int(), signature: z.string().max(128) }).optional(),
});
export type MediaInfo = z.infer<typeof mediaInfoSchema>;
export const mediaMapSchema = z.record(z.uuid(), mediaInfoSchema);
export type MediaMap = z.infer<typeof mediaMapSchema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every media library image that some content uses (any `{ mediaId }` inside it). */
export function mediaIds(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) mediaIds(item, into);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'mediaId' && typeof item === 'string' && UUID.test(item)) {
        into.add(item.toLowerCase());
      } else {
        mediaIds(item, into);
      }
    }
  }
  return into;
}

/**
 * A video hosted on YouTube or Vimeo (D-046), stored as the service and the video's id only,
 * never as a free address. Sites load the player only after a visitor presses play.
 */
export const videoRefSchema = z
  .discriminatedUnion('provider', [
    z.strictObject({ provider: z.literal('youtube'), id: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }),
    z.strictObject({ provider: z.literal('vimeo'), id: z.string().regex(/^[0-9]{6,12}$/) }),
  ])
  .nullable();
export type VideoRef = z.infer<typeof videoRefSchema>;

/** Reads a YouTube or Vimeo link as pasted from the browser or a share button. */
export function parseVideoUrl(input: string): NonNullable<VideoRef> | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  const parts = url.pathname.split('/').filter(Boolean);
  let candidate: NonNullable<VideoRef> | null = null;
  if (host === 'youtu.be') {
    candidate = { provider: 'youtube', id: parts[0] ?? '' };
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      parts[0] === 'watch'
        ? url.searchParams.get('v')
        : ['embed', 'shorts', 'live'].includes(parts[0] ?? '')
          ? parts[1]
          : null;
    candidate = { provider: 'youtube', id: id ?? '' };
  } else if (host === 'vimeo.com') {
    candidate = { provider: 'vimeo', id: parts.find((p) => /^[0-9]+$/.test(p)) ?? '' };
  } else if (host === 'player.vimeo.com' && parts[0] === 'video') {
    candidate = { provider: 'vimeo', id: parts[1] ?? '' };
  }
  const parsed = videoRefSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Where the video plays: the provider's privacy-friendlier player, started at once. */
export function videoEmbedUrl(video: NonNullable<VideoRef>): string {
  return video.provider === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`
    : `https://player.vimeo.com/video/${video.id}?autoplay=1&dnt=1`;
}

/** The video's own page, for visitors without JavaScript. */
export function videoPageUrl(video: NonNullable<VideoRef>): string {
  return video.provider === 'youtube'
    ? `https://www.youtube.com/watch?v=${video.id}`
    : `https://vimeo.com/${video.id}`;
}

/** The players a site may frame (its Content-Security-Policy's frame-src). */
export const VIDEO_FRAME_ORIGINS = [
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
] as const;
