import { mediaAssets, type Database } from '@hantex/db/worker';
import { mediaIds, type Bilingual, type MediaMap } from '@hantex/sections';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { hmacHex } from './crypto';
import { copyFile, previewKey, privateKey, publicKey, type MediaStore } from './media-store';
import type { SiteContent } from './site-content';

/**
 * How media library images (D-044) reach the websites: published content's images are copied
 * from the private bucket to the public one, which the site Workers serve as `/media/…`; previews
 * get short-lived copies behind signed links; images that content uses can't be deleted.
 */

export interface Variant {
  width: number;
  height: number;
  bytes: number;
}

export interface Stores {
  private: MediaStore;
  public: MediaStore;
}

interface Site {
  id: string;
  key: string;
}

/** Every image in the website's media library. */
export async function libraryIds(db: Database, siteId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.siteId, siteId));
  return new Set(rows.map((r) => r.id));
}

/** Copies the images published content uses to the public bucket, each once. */
export async function publishMedia(
  db: Database,
  stores: Stores,
  site: Site,
  ids: ReadonlySet<string>,
): Promise<number> {
  if (ids.size === 0) return 0;
  const rows = await db
    .select({ id: mediaAssets.id, variants: mediaAssets.variants })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.siteId, site.id),
        inArray(mediaAssets.id, [...ids]),
        isNull(mediaAssets.publishedAt),
      ),
    );
  for (const row of rows) {
    for (const { width } of row.variants as Variant[]) {
      await copyFile(
        stores.private,
        privateKey(site.id, row.id, width),
        stores.public,
        publicKey(site.key, row.id, width),
      );
    }
    await db.update(mediaAssets).set({ publishedAt: new Date() }).where(eq(mediaAssets.id, row.id));
  }
  return rows.length;
}

/** The message a preview image link signs; the site Worker checks the same one. */
export const previewMessage = (siteKey: string, mediaId: string, expires: number) =>
  `media:${siteKey}:${mediaId}:${expires}`;

/**
 * What a preview needs to draw the images some content uses. Published images use their public
 * address; the others get a copy under `preview/` and a signed link that expires with the preview.
 */
export async function previewMedia(
  db: Database,
  stores: Stores,
  site: Site,
  secret: string,
  ids: ReadonlySet<string>,
  expires: number,
): Promise<MediaMap> {
  if (ids.size === 0) return {};
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.siteId, site.id), inArray(mediaAssets.id, [...ids])));
  const media: MediaMap = {};
  for (const row of rows) {
    const variants = row.variants as Variant[];
    media[row.id] = {
      width: row.width,
      height: row.height,
      widths: variants.map((v) => v.width),
      alt: row.alt as Bilingual,
    };
    if (row.publishedAt) continue;
    for (const { width } of variants) {
      const key = previewKey(site.key, row.id, width);
      if (!(await stores.public.has(key))) {
        await copyFile(stores.private, privateKey(site.id, row.id, width), stores.public, key);
      }
    }
    media[row.id]!.preview = {
      expires,
      signature: await hmacHex(secret, previewMessage(site.key, row.id, expires)),
    };
  }
  return media;
}

/** Pages and saved sections whose content uses an image. */
export function usesOf(content: SiteContent, mediaId: string) {
  const pages = [...content.pages]
    .filter(([, page]) => mediaIds(page).has(mediaId))
    .map(([id, page]) => ({ id, title: page.title }));
  const saved = content.saved.items
    .filter((item) => mediaIds(item.section).has(mediaId))
    .map((item) => ({ id: item.id, name: item.name }));
  return { pages, saved };
}
