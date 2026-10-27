import { documentDrafts, documentVersions, type Database } from '@hantex/db/worker';
import {
  DEFAULT_CATALOGUE,
  catalogueSchema,
  mediaIds,
  productSchema,
  type Catalogue,
  type Product,
} from '@hantex/sections';
import { and, desc, eq, inArray } from 'drizzle-orm';

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

/** The latest published version of each catalogue document, one row per document. */
async function latestVersions(db: Database, siteId: string) {
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

async function drafts(db: Database, siteId: string) {
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
export async function publishedCatalogue(db: Database, siteId: string) {
  const latest = await latestVersions(db, siteId);
  return assemble((id) => latest.get(id)?.data);
}

/** The working drafts, falling back to the published version where nothing is being edited. */
export async function draftCatalogue(db: Database, siteId: string) {
  const [draftRows, latest] = await Promise.all([drafts(db, siteId), latestVersions(db, siteId)]);
  return assemble((id) => draftRows.get(id)?.data ?? latest.get(id)?.data);
}

/** Latest published version per catalogue document, for the dashboard's "changed" badges. */
export async function publishedCatalogueVersions(db: Database, siteId: string) {
  return latestVersions(db, siteId);
}

/** Categories, finishes and products whose content uses an image. */
export function catalogueUsesOf(content: CatalogueContent, mediaId: string) {
  const uses = (value: unknown) => mediaIds(value).has(mediaId);
  return [
    ...content.catalogue.categories
      .filter(uses)
      .map((c) => ({ type: 'category' as const, id: c.id, name: c.name })),
    ...content.catalogue.finishes
      .filter(uses)
      .map((f) => ({ type: 'finish' as const, id: f.id, name: f.name })),
    ...[...content.products]
      .filter(([, p]) => uses(p))
      .map(([id, p]) => ({ type: 'product' as const, id, name: p.name })),
  ];
}
