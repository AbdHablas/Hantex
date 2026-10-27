import { documentDrafts, documentVersions, type Database } from '@hantex/db/worker';
import {
  DEFAULT_CATALOGUE,
  catalogueSchema,
  fileIds,
  mediaIds,
  productSchema,
  type Catalogue,
  type Product,
} from '@hantex/sections';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

/**
 * A website's catalogue (D-026, D-045): the structure document and every product it lists, read
 * as the working drafts or as the latest published versions. Rows that no longer match the
 * schema are skipped rather than trusted.
 */
export interface CatalogueContent {
  catalogue: Catalogue;
  products: Map<string, Product>;
}

const KINDS = ['catalogue', 'product'] as const;

/** The database or a transaction, for reading. */
export type Reader = Pick<Database, 'select' | 'selectDistinctOn'>;

/** Takes the website's catalogue lock until the end of the current transaction. */
export async function lockCatalogue(tx: Pick<Database, 'execute'>, siteId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`catalogue:${siteId}`}, 0))`,
  );
}

/**
 * Runs `fn` in a transaction holding the website's catalogue lock, so changes that read the
 * catalogue and write it back (product order, the structure checks, verification, publishing)
 * never overwrite each other or act on what another request is changing.
 */
export function withCatalogueLock<T>(
  db: Database,
  siteId: string,
  fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockCatalogue(tx, siteId);
    return fn(tx);
  });
}

/** The latest published version of each catalogue document, one row per document. */
async function latestVersions(db: Reader, siteId: string) {
  const rows = await db
    .selectDistinctOn([documentVersions.kind, documentVersions.key], {
      kind: documentVersions.kind,
      key: documentVersions.key,
      version: documentVersions.version,
      data: documentVersions.data,
    })
    .from(documentVersions)
    .where(and(eq(documentVersions.siteId, siteId), inArray(documentVersions.kind, [...KINDS])))
    .orderBy(documentVersions.kind, documentVersions.key, desc(documentVersions.version));
  return new Map(rows.map((r) => [`${r.kind}:${r.key}`, r]));
}

async function drafts(db: Reader, siteId: string) {
  const rows = await db
    .select({ kind: documentDrafts.kind, key: documentDrafts.key, data: documentDrafts.data })
    .from(documentDrafts)
    .where(and(eq(documentDrafts.siteId, siteId), inArray(documentDrafts.kind, [...KINDS])));
  return new Map(rows.map((r) => [`${r.kind}:${r.key}`, r]));
}

function assemble(pick: (id: string) => unknown): CatalogueContent {
  const parsed = catalogueSchema.safeParse(pick('catalogue:'));
  const catalogue = parsed.success ? parsed.data : DEFAULT_CATALOGUE;
  const products = new Map<string, Product>();
  for (const id of catalogue.products) {
    const product = productSchema.safeParse(pick(`product:${id}`));
    if (product.success) products.set(id, product.data);
  }
  return { catalogue, products };
}

/** The published catalogue: what the live site is built from. */
export async function publishedCatalogue(db: Reader, siteId: string) {
  const latest = await latestVersions(db, siteId);
  return assemble((id) => latest.get(id)?.data);
}

/** The working drafts, falling back to the published version where nothing is being edited. */
export async function draftCatalogue(db: Reader, siteId: string) {
  const [draftRows, latest] = await Promise.all([drafts(db, siteId), latestVersions(db, siteId)]);
  return assemble((id) => draftRows.get(id)?.data ?? latest.get(id)?.data);
}

/** Latest published version per catalogue document, for the dashboard's "changed" badges. */
export async function publishedCatalogueVersions(db: Reader, siteId: string) {
  return latestVersions(db, siteId);
}

/** Categories, finishes, series and products whose content uses an image. */
export function catalogueUsesOf(content: CatalogueContent, mediaId: string) {
  const uses = (value: unknown) => mediaIds(value).has(mediaId);
  return [
    ...content.catalogue.categories
      .filter(uses)
      .map((c) => ({ type: 'category' as const, id: c.id, name: c.name })),
    ...content.catalogue.finishes
      .filter(uses)
      .map((f) => ({ type: 'finish' as const, id: f.id, name: f.name })),
    ...content.catalogue.series
      .filter(uses)
      .map((x) => ({ type: 'series' as const, id: x.id, name: x.name })),
    ...[...content.products]
      .filter(([, p]) => uses(p))
      .map(([id, p]) => ({ type: 'product' as const, id, name: p.name })),
  ];
}

/** Series and products that attach a file. */
export function catalogueFileUsesOf(content: CatalogueContent, fileId: string) {
  const uses = (value: unknown) => fileIds(value).has(fileId);
  return [
    ...content.catalogue.series
      .filter(uses)
      .map((x) => ({ type: 'series' as const, id: x.id, name: x.name })),
    ...[...content.products]
      .filter(([, p]) => uses(p))
      .map(([id, p]) => ({ type: 'product' as const, id, name: p.name })),
  ];
}

/** Uses in the drafts and in the published catalogue, each once. */
export async function catalogueFileUses(db: Reader, siteId: string, fileId: string) {
  const all = [
    ...catalogueFileUsesOf(await draftCatalogue(db, siteId), fileId),
    ...catalogueFileUsesOf(await publishedCatalogue(db, siteId), fileId),
  ];
  return [...new Map(all.map((x) => [`${x.type}:${x.id}`, x])).values()];
}
