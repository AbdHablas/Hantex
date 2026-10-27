import { documentDrafts, documentVersions, fonts, type Database } from '@hantex/db/worker';
import {
  checkThemeFonts,
  fontCatalogue,
  uploadedFontId,
  type FontCatalogue,
  type FontIssue,
  type Script,
  type Theme,
  type UploadedFont,
} from '@hantex/theme';
import { and, eq, sql } from 'drizzle-orm';
import { badRequest } from './errors';

export interface FontFile {
  weight: number;
  bytes: number;
}

/** The uploaded fonts (D-033), as the theme package describes them. */
export async function uploadedFonts(db: Database): Promise<UploadedFont[]> {
  const rows = await db
    .select({ id: fonts.id, family: fonts.family, scripts: fonts.scripts, files: fonts.files })
    .from(fonts);
  return rows.map((row) => ({
    id: uploadedFontId(row.id),
    name: row.family,
    scripts: row.scripts as Script[],
    weights: (row.files as FontFile[]).map((f) => f.weight),
  }));
}

export const loadCatalogue = async (db: Database): Promise<FontCatalogue> =>
  fontCatalogue(await uploadedFonts(db));

/** Refuses a theme whose fonts are missing from the library or can't write their script. */
export async function requireThemeFonts(db: Database, theme: Theme) {
  const issues: FontIssue[] = checkThemeFonts(theme.typography, await loadCatalogue(db));
  if (issues.length > 0) throw badRequest('theme-fonts', { issues });
}

/**
 * Sites whose theme draft or published theme uses an uploaded font. Older versions aren't
 * counted: restoring one that uses a deleted font is refused by the font check.
 */
export async function sitesUsingFont(db: Database, fontId: string): Promise<string[]> {
  const ref = `%${uploadedFontId(fontId)}%`;
  const drafts = await db
    .select({ siteId: documentDrafts.siteId })
    .from(documentDrafts)
    .where(and(eq(documentDrafts.kind, 'theme'), sql`${documentDrafts.data}::text like ${ref}`));
  const published = await db.execute<{ site_id: string }>(sql`
    select site_id from (
      select distinct on (site_id) site_id, data from ${documentVersions}
      where kind = 'theme' order by site_id, version desc
    ) latest where data::text like ${ref}`);
  return [...new Set([...drafts.map((d) => d.siteId), ...published.rows.map((r) => r.site_id)])];
}
