/**
 * Curated, self-hosted font library (D-013, D-015, D-022). Administrators can only pick fonts
 * from this list; adding one is a reviewed code change (licence check, files from @fontsource).
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
