import {
  documentDrafts,
  documentVersions,
  type Database,
  type DocumentKind,
} from '@hantex/db/worker';
import {
  DEFAULT_COMING_SOON,
  DEFAULT_SITE_SETTINGS,
  comingSoonSchema,
  siteSettingsSchema,
  type Permission,
} from '@hantex/shared';
import {
  DEFAULT_LAYOUT,
  DEFAULT_MENUS,
  DEFAULT_PAGES_INDEX,
  DEFAULT_SAVED_SECTIONS,
  layoutSchema,
  menusSchema,
  newPage,
  pageSchema,
  pagesIndexSchema,
  savedSectionsSchema,
} from '@hantex/sections';
import { DEFAULT_LOGO, logoSchema } from '@hantex/shared/logo';
import { brandTheme, themeSchema } from '@hantex/theme';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ZodType } from 'zod';

export const KINDS = [
  'coming-soon',
  'site-settings',
  'theme',
  'logo',
] as const satisfies readonly DocumentKind[];

export const DOCUMENTS: Record<
  DocumentKind,
  {
    schema: ZodType;
    defaults: unknown;
    view: Permission[];
    edit: Permission[];
    publish: Permission[];
  }
> = {
  'coming-soon': {
    schema: comingSoonSchema,
    defaults: DEFAULT_COMING_SOON,
    view: ['comingSoon.view'],
    edit: ['comingSoon.edit'],
    publish: ['site.publish'],
  },
  'site-settings': {
    schema: siteSettingsSchema,
    defaults: DEFAULT_SITE_SETTINGS,
    view: ['settings.view'],
    edit: ['settings.edit'],
    publish: ['settings.edit', 'site.publish'],
  },
  theme: {
    schema: themeSchema,
    defaults: brandTheme,
    view: ['appearance.edit'],
    edit: ['appearance.edit'],
    publish: ['appearance.publish'],
  },
  // Uploaded logos (D-027): replacing a site's logo is a brand decision, so it needs the logo
  // permission (Owner only by default) as well as the appearance ones.
  logo: {
    schema: logoSchema,
    defaults: DEFAULT_LOGO,
    view: ['appearance.edit'],
    edit: ['appearance.edit', 'appearance.editLogo'],
    publish: ['appearance.publish', 'appearance.editLogo'],
  },
  // Website builder (D-035): one document per page, plus the page index, menus and layout. They
  // go live together through Publish changes (D-037).
  page: {
    schema: pageSchema,
    defaults: newPage({ ar: '', en: '' }, 'page'),
    view: ['pages.view'],
    edit: ['pages.edit'],
    publish: ['pages.edit', 'site.publish'],
  },
  pages: {
    schema: pagesIndexSchema,
    defaults: DEFAULT_PAGES_INDEX,
    view: ['pages.view'],
    edit: ['pages.edit'],
    publish: ['pages.edit', 'site.publish'],
  },
  menus: {
    schema: menusSchema,
    defaults: DEFAULT_MENUS,
    view: ['pages.view'],
    edit: ['pages.edit'],
    publish: ['pages.edit', 'site.publish'],
  },
  layout: {
    schema: layoutSchema,
    defaults: DEFAULT_LAYOUT,
    view: ['pages.view'],
    edit: ['pages.edit'],
    publish: ['pages.edit', 'site.publish'],
  },
  'saved-sections': {
    schema: savedSectionsSchema,
    defaults: DEFAULT_SAVED_SECTIONS,
    view: ['pages.view'],
    edit: ['pages.edit'],
    publish: ['pages.edit', 'site.publish'],
  },
};

/** Every site has these builder documents; pages are the only kind with many (keyed by page id). */
export const BUILDER_KINDS = ['pages', 'menus', 'layout', 'saved-sections'] as const;

const versionsOf = (siteId: string, kind: DocumentKind, key = '') =>
  and(
    eq(documentVersions.siteId, siteId),
    eq(documentVersions.kind, kind),
    eq(documentVersions.key, key),
  );

export async function latestPublished(db: Database, siteId: string, kind: DocumentKind, key = '') {
  const [row] = await db
    .select()
    .from(documentVersions)
    .where(versionsOf(siteId, kind, key))
    .orderBy(desc(documentVersions.version))
    .limit(1);
  return row ?? null;
}

/** The working draft, or the published version, or the defaults (nothing factual pre-filled). */
export async function currentDraft(db: Database, siteId: string, kind: DocumentKind, key = '') {
  const [draft] = await db
    .select()
    .from(documentDrafts)
    .where(
      and(
        eq(documentDrafts.siteId, siteId),
        eq(documentDrafts.kind, kind),
        eq(documentDrafts.key, key),
      ),
    );
  // Stored data written by an older format is upgraded on read (e.g. theme version 1 → 2).
  const normalise = (data: unknown) => {
    const parsed = DOCUMENTS[kind].schema.safeParse(data);
    return parsed.success ? parsed.data : data;
  };
  if (draft) return { data: normalise(draft.data), updatedAt: draft.updatedAt };
  const published = await latestPublished(db, siteId, kind, key);
  return { data: normalise(published?.data ?? DOCUMENTS[kind].defaults), updatedAt: null };
}

/** The database or a transaction: anything that can run these queries. */
export type Executor = Pick<Database, 'insert' | 'select' | 'update' | 'delete'>;

export async function saveDraft(
  db: Executor,
  siteId: string,
  kind: DocumentKind,
  data: unknown,
  userId: string,
  key = '',
) {
  await db
    .insert(documentDrafts)
    .values({ siteId, kind, key, data, updatedBy: userId })
    .onConflictDoUpdate({
      target: [documentDrafts.siteId, documentDrafts.kind, documentDrafts.key],
      set: { data, updatedBy: userId, updatedAt: new Date() },
    });
}

/** Appends an immutable version; the unique (site, kind, version) index guards against races. */
export async function publishVersion(
  db: Executor,
  siteId: string,
  kind: DocumentKind,
  data: unknown,
  userId: string,
  restoredFrom: number | null = null,
  key = '',
): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [row] = await db
        .insert(documentVersions)
        .values({
          siteId,
          kind,
          key,
          data,
          publishedBy: userId,
          restoredFrom,
          version: sql`(select coalesce(max(${documentVersions.version}), 0) + 1 from ${documentVersions} where ${documentVersions.siteId} = ${siteId} and ${documentVersions.kind} = ${kind} and ${documentVersions.key} = ${key})`,
        })
        .returning({ version: documentVersions.version });
      if (row) return row.version;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error('Could not publish');
}
