import { mediaAssets, siteFiles, type Database } from '@hantex/db/worker';
import { and, eq, inArray, isNull, sum } from 'drizzle-orm';
import { copyFile, privateFileKey, publicFileKey } from './media-store';
import type { Stores } from './media-library';

/**
 * A website's files (D-045): PDFs the catalogue attaches. Like images, they are kept private
 * and copied to the public bucket only when published content attaches them.
 */

/** Every file the website has. */
export async function fileLibraryIds(
  db: Pick<Database, 'select'>,
  siteId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ id: siteFiles.id })
    .from(siteFiles)
    .where(eq(siteFiles.siteId, siteId));
  return new Set(rows.map((r) => r.id));
}

/** Copies the files published content attaches to the public bucket, each once. */
export async function publishFiles(
  db: Database,
  stores: Stores,
  site: { id: string; key: string },
  ids: ReadonlySet<string>,
): Promise<number> {
  if (ids.size === 0) return 0;
  const rows = await db
    .select({ id: siteFiles.id })
    .from(siteFiles)
    .where(
      and(
        eq(siteFiles.siteId, site.id),
        inArray(siteFiles.id, [...ids]),
        isNull(siteFiles.publishedAt),
      ),
    );
  for (const row of rows) {
    await copyFile(
      stores.private,
      privateFileKey(site.id, row.id),
      stores.public,
      publicFileKey(site.key, row.id),
    );
    await db.update(siteFiles).set({ publishedAt: new Date() }).where(eq(siteFiles.id, row.id));
  }
  return rows.length;
}

/** Bytes a website stores: its images and its files share one quota. */
export async function storedBytes(db: Database, siteId: string): Promise<number> {
  const [[images], [files]] = await Promise.all([
    db
      .select({ bytes: sum(mediaAssets.bytes) })
      .from(mediaAssets)
      .where(eq(mediaAssets.siteId, siteId)),
    db
      .select({ bytes: sum(siteFiles.bytes) })
      .from(siteFiles)
      .where(eq(siteFiles.siteId, siteId)),
  ]);
  return Number(images?.bytes ?? 0) + Number(files?.bytes ?? 0);
}
