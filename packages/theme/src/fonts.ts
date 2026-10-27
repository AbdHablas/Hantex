import { z } from 'zod';

/**
 * Curated, self-hosted font library (D-013, D-022, D-031): the built-in fonts, with files from
 * @fontsource. The Owner can add more in the dashboard (D-033); those are "uploaded fonts",
 * referred to by id and described by a catalogue the dashboard, API and build pass in.
 */
export type Script = 'latin' | 'arabic';

export interface FontDefinition {
  family: string;
  scripts: readonly Script[];
  weights: readonly number[];
  /** npm package that provides the WOFF2 files. */
  source: string;
  licence: 'OFL-1.1';
}

export const FONT_LIBRARY = {
  poppins: {
    family: 'Poppins',
    scripts: ['latin'],
    weights: [300, 400, 500, 600, 700],
    source: '@fontsource/poppins',
    licence: 'OFL-1.1',
  },
  inter: {
    family: 'Inter',
    scripts: ['latin'],
    weights: [300, 400, 500, 600, 700],
    source: '@fontsource/inter',
    licence: 'OFL-1.1',
  },
  cairo: {
    family: 'Cairo',
    scripts: ['arabic', 'latin'],
    weights: [300, 400, 500, 600, 700],
    source: '@fontsource/cairo',
    licence: 'OFL-1.1',
  },
  'readex-pro': {
    family: 'Readex Pro',
    scripts: ['arabic', 'latin'],
    weights: [300, 400, 500, 600, 700],
    source: '@fontsource/readex-pro',
    licence: 'OFL-1.1',
  },
  tajawal: {
    family: 'Tajawal',
    scripts: ['arabic', 'latin'],
    weights: [300, 400, 500, 700],
    source: '@fontsource/tajawal',
    licence: 'OFL-1.1',
  },
  'ibm-plex-sans-arabic': {
    family: 'IBM Plex Sans Arabic',
    scripts: ['arabic', 'latin'],
    weights: [300, 400, 500, 600, 700],
    source: '@fontsource/ibm-plex-sans-arabic',
    licence: 'OFL-1.1',
  },
} as const satisfies Record<string, FontDefinition>;

export type FontId = keyof typeof FONT_LIBRARY;

export const fontIds = Object.keys(FONT_LIBRARY) as FontId[];

export const fontsForScript = (script: Script): FontId[] =>
  fontIds.filter((id) => (FONT_LIBRARY[id].scripts as readonly Script[]).includes(script));

/** An uploaded font's reference in a theme: `upload-<uuid>` (D-033). */
export type UploadedFontId = `upload-${string}`;
export type FontRef = FontId | UploadedFontId;
export const UPLOADED_FONT_ID =
  /^upload-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const uploadedFontId = (uuid: string): UploadedFontId => `upload-${uuid}`;
export const isUploadedFont = (ref: string): ref is UploadedFontId => UPLOADED_FONT_ID.test(ref);

/** An uploaded font as the API sends it in previews; checked like everything else. */
export const uploadedFontSchema = z.strictObject({
  id: z.string().regex(UPLOADED_FONT_ID) as unknown as z.ZodType<UploadedFontId>,
  name: z.string().max(80),
  scripts: z
    .array(z.enum(['latin', 'arabic']))
    .min(1)
    .max(2),
  weights: z.array(z.number().int().min(100).max(900).multipleOf(100)).min(1).max(9),
});

export interface UploadedFont {
  id: UploadedFontId;
  /** The name the font gives itself, shown in the dashboard. */
  name: string;
  scripts: readonly Script[];
  weights: readonly number[];
}

/** What a theme needs to know about each font it may use. */
export interface CatalogueEntry {
  /** CSS family name. Uploaded fonts use their id, so names never clash or need escaping. */
  family: string;
  /** Name shown to people. */
  name: string;
  scripts: readonly Script[];
  weights: readonly number[];
  uploaded: boolean;
}

export type FontCatalogue = ReadonlyMap<FontRef, CatalogueEntry>;

/** The built-in fonts, plus any uploaded ones. */
export function fontCatalogue(uploaded: readonly UploadedFont[] = []): FontCatalogue {
  const catalogue = new Map<FontRef, CatalogueEntry>();
  for (const id of fontIds) {
    const font = FONT_LIBRARY[id];
    catalogue.set(id, {
      family: font.family,
      name: font.family,
      scripts: font.scripts,
      weights: font.weights,
      uploaded: false,
    });
  }
  for (const font of uploaded) {
    catalogue.set(font.id, {
      family: font.id,
      name: font.name,
      scripts: font.scripts,
      weights: font.weights,
      uploaded: true,
    });
  }
  return catalogue;
}

export const BUILT_IN_FONTS = fontCatalogue();
