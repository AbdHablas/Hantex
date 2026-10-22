import { documentDrafts, documentVersions, type Database } from '@hantex/db/worker';
import {
  DEFAULT_LAYOUT,
  DEFAULT_MENUS,
  DEFAULT_PAGES_INDEX,
  layoutSchema,
  menusSchema,
  pageSchema,
  pagePath,
  pagesIndexSchema,
  type Layout,
  type Menus,
  type Page,
  type PagesIndex,
} from '@hantex/sections';
import { desc, eq } from 'drizzle-orm';

/**
 * A website's builder content (D-035): the page index, every page, menus and layout, read either
 * as the working drafts or as the latest published versions. Rows that no longer match the
 * schema are skipped rather than trusted.
 */
export interface SiteContent {
  index: PagesIndex;
  pages: Map<string, Page>;
  menus: Menus;
  layout: Layout;
}

type Kind = 'page' | 'pages' | 'menus' | 'layout';

async function latestVersions(db: Database, siteId: string, kinds: Kind[]) {
  const rows = await db
    .select({
      kind: documentVersions.kind,
      key: documentVersions.key,
      version: documentVersions.version,
      data: documentVersions.data,
    })
    .from(documentVersions)
    .where(eq(documentVersions.siteId, siteId))
    .orderBy(desc(documentVersions.version));
  const latest = new Map<string, { version: number; data: unknown }>();
  for (const row of rows) {
    if (!(kinds as string[]).includes(row.kind)) continue;
    const id = `${row.kind}:${row.key}`;
    if (!latest.has(id)) latest.set(id, { version: row.version, data: row.data });
  }
  return latest;
}

async function drafts(db: Database, siteId: string) {
  const rows = await db
    .select({
      kind: documentDrafts.kind,
      key: documentDrafts.key,
      data: documentDrafts.data,
      updatedAt: documentDrafts.updatedAt,
    })
    .from(documentDrafts)
    .where(eq(documentDrafts.siteId, siteId));
  return new Map(rows.map((r) => [`${r.kind}:${r.key}`, r]));
}

const parse = <T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  value: unknown,
  fallback: T,
): T => {
  const result = schema.safeParse(value);
  return result.success ? (result.data as T) : fallback;
};

/** The published content: what the live site is built from. */
export async function publishedContent(db: Database, siteId: string): Promise<SiteContent> {
  const latest = await latestVersions(db, siteId, ['page', 'pages', 'menus', 'layout']);
  const index = parse(pagesIndexSchema, latest.get('pages:')?.data, DEFAULT_PAGES_INDEX);
  const pages = new Map<string, Page>();
  for (const id of index.order) {
    const row = latest.get(`page:${id}`);
    const page = row ? pageSchema.safeParse(row.data) : null;
    if (page?.success) pages.set(id, page.data);
  }
  return {
    index,
    pages,
    menus: parse(menusSchema, latest.get('menus:')?.data, DEFAULT_MENUS),
    layout: parse(layoutSchema, latest.get('layout:')?.data, DEFAULT_LAYOUT),
  };
}

/** The working drafts, falling back to the published version where nothing is being edited. */
export async function draftContent(db: Database, siteId: string): Promise<SiteContent> {
  const [draftRows, latest] = await Promise.all([
    drafts(db, siteId),
    latestVersions(db, siteId, ['page', 'pages', 'menus', 'layout']),
  ]);
  const pick = (id: string) => draftRows.get(id)?.data ?? latest.get(id)?.data;
  const index = parse(pagesIndexSchema, pick('pages:'), DEFAULT_PAGES_INDEX);
  const pages = new Map<string, Page>();
  for (const id of index.order) {
    const page = pageSchema.safeParse(pick(`page:${id}`));
    if (page.success) pages.set(id, page.data);
  }
  return {
    index,
    pages,
    menus: parse(menusSchema, pick('menus:'), DEFAULT_MENUS),
    layout: parse(layoutSchema, pick('layout:'), DEFAULT_LAYOUT),
  };
}

/** Pages whose published address changes, as redirects from the old address (D-037). */
export function newRedirects(published: SiteContent, next: SiteContent): PagesIndex['redirects'] {
  const redirects: PagesIndex['redirects'] = [];
  for (const id of published.index.order) {
    const before = published.pages.get(id);
    if (!before?.visible || !next.pages.get(id)?.visible || !next.index.order.includes(id))
      continue;
    const from = pagePath(id, published.pages, published.index.home);
    const to = pagePath(id, next.pages, next.index.home);
    if (from !== to && from !== '/') redirects.push({ from, to: id });
  }
  return redirects;
}

/** Latest version number per builder document, for the dashboard's "changed" badges. */
export async function publishedVersions(db: Database, siteId: string) {
  const latest = await latestVersions(db, siteId, ['page', 'pages', 'menus', 'layout']);
  return new Map([...latest].map(([id, row]) => [id, row]));
}

/** JSON with object keys sorted, so data read back from the database (JSONB reorders keys) compares equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export const sameData = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
