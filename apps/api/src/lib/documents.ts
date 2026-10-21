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
import { brandTheme, themeSchema } from '@hantex/theme';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ZodType } from 'zod';

export const KINDS = [
  'coming-soon',
  'site-settings',
  'theme',
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
};

const versionsOf = (siteId: string, kind: DocumentKind) =>
  and(eq(documentVersions.siteId, siteId), eq(documentVersions.kind, kind));

export async function latestPublished(db: Database, siteId: string, kind: DocumentKind) {
  const [row] = await db
    .select()
    .from(documentVersions)
    .where(versionsOf(siteId, kind))
    .orderBy(desc(documentVersions.version))
    .limit(1);
  return row ?? null;
}

/** The working draft, or the published version, or the defaults (nothing factual pre-filled). */
export async function currentDraft(db: Database, siteId: string, kind: DocumentKind) {
  const [draft] = await db
    .select()
    .from(documentDrafts)
    .where(and(eq(documentDrafts.siteId, siteId), eq(documentDrafts.kind, kind)));
  if (draft) return { data: draft.data, updatedAt: draft.updatedAt };
  const published = await latestPublished(db, siteId, kind);
  return { data: published?.data ?? DOCUMENTS[kind].defaults, updatedAt: null };
}

export async function saveDraft(
  db: Database,
  siteId: string,
  kind: DocumentKind,
  data: unknown,
  userId: string,
) {
  await db
    .insert(documentDrafts)
    .values({ siteId, kind, data, updatedBy: userId })
    .onConflictDoUpdate({
      target: [documentDrafts.siteId, documentDrafts.kind],
      set: { data, updatedBy: userId, updatedAt: new Date() },
    });
}

/** Appends an immutable version; the unique (site, kind, version) index guards against races. */
export async function publishVersion(
  db: Database,
  siteId: string,
  kind: DocumentKind,
  data: unknown,
  userId: string,
  restoredFrom: number | null = null,
): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [row] = await db
        .insert(documentVersions)
        .values({
          siteId,
          kind,
          data,
          publishedBy: userId,
          restoredFrom,
          version: sql`(select coalesce(max(${documentVersions.version}), 0) + 1 from ${documentVersions} where ${documentVersions.siteId} = ${siteId} and ${documentVersions.kind} = ${kind})`,
        })
        .returning({ version: documentVersions.version });
      if (row) return row.version;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error('Could not publish');
}
