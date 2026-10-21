import { documentVersions, sites, themePresets, type Database } from '@hantex/db/worker';
import { BUILT_IN_PRESETS, brandTheme, themeSchema, type Theme } from '@hantex/theme';
import { and, desc, eq } from 'drizzle-orm';

/** A site's published theme, or the brand theme if none is published yet. */
export async function publishedTheme(db: Database, siteId: string): Promise<Theme> {
  const [row] = await db
    .select({ data: documentVersions.data })
    .from(documentVersions)
    .where(and(eq(documentVersions.siteId, siteId), eq(documentVersions.kind, 'theme')))
    .orderBy(desc(documentVersions.version))
    .limit(1);
  const parsed = row ? themeSchema.safeParse(row.data) : null;
  return parsed?.success ? parsed.data : brandTheme;
}

/** Resolves a built-in preset id ("brand", "neutral") or a saved preset's id to its theme. */
export async function presetTheme(db: Database, id: string): Promise<Theme | null> {
  const builtIn = BUILT_IN_PRESETS.find((p) => p.id === id);
  if (builtIn) return builtIn.theme;
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db.select().from(themePresets).where(eq(themePresets.id, id));
  const parsed = row ? themeSchema.safeParse(row.data) : null;
  return parsed?.success ? parsed.data : null;
}

export async function siteIdByKey(db: Database, key: string): Promise<string | null> {
  const [row] = await db.select({ id: sites.id }).from(sites).where(eq(sites.key, key));
  return row?.id ?? null;
}
