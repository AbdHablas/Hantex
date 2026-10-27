import { z } from 'zod';
import {
  BUILT_IN_FONTS,
  UPLOADED_FONT_ID,
  fontsForScript,
  type FontCatalogue,
  type FontId,
  type FontRef,
  type UploadedFontId,
} from './fonts';

/**
 * The typography system (D-032): named text styles that every component uses, two font roles
 * (heading and body), each with a Latin and an Arabic family. Sizes are in pixels at desktop
 * width; large sizes scale down fluidly on small screens. Arabic gets its own line height and
 * never letter spacing (it breaks the joins between letters).
 */

export const TEXT_STYLES = [
  'display',
  'h1',
  'h2',
  'h3',
  'body',
  'small',
  'nav',
  'button',
  'label',
  'productTitle',
  'price',
  'spec',
] as const;

export type TextStyleId = (typeof TEXT_STYLES)[number];

export const FONT_ROLES = ['heading', 'body'] as const;
export type FontRole = (typeof FONT_ROLES)[number];

export const WEIGHTS = [300, 400, 500, 600, 700] as const;
export type Weight = (typeof WEIGHTS)[number];

/** Readability limits: the smallest size and line height each style may have. */
export const STYLE_LIMITS: Record<TextStyleId, { minSize: number; minLineHeight: number }> = {
  display: { minSize: 28, minLineHeight: 1 },
  h1: { minSize: 24, minLineHeight: 1 },
  h2: { minSize: 20, minLineHeight: 1.05 },
  h3: { minSize: 17, minLineHeight: 1.1 },
  body: { minSize: 14, minLineHeight: 1.4 },
  small: { minSize: 12, minLineHeight: 1.3 },
  nav: { minSize: 13, minLineHeight: 1.2 },
  button: { minSize: 13, minLineHeight: 1 },
  label: { minSize: 12, minLineHeight: 1.1 },
  productTitle: { minSize: 15, minLineHeight: 1.1 },
  price: { minSize: 14, minLineHeight: 1 },
  spec: { minSize: 13, minLineHeight: 1.3 },
};

/**
 * A built-in font that writes the script, or an uploaded font. Whether an uploaded font exists
 * and writes the script is checked against the font library when saving and publishing
 * (checkThemeFonts), since the schema can't know which fonts have been uploaded.
 */
const fontFor = (script: 'latin' | 'arabic') =>
  z.union([
    z.enum(fontsForScript(script) as [FontId, ...FontId[]]),
    z.string().regex(UPLOADED_FONT_ID) as unknown as z.ZodType<UploadedFontId>,
  ]);

const pairSchema = z.strictObject({ latin: fontFor('latin'), arabic: fontFor('arabic') });

export const textStyleSchema = z.strictObject({
  font: z.enum(FONT_ROLES),
  size: z.number().int().min(11).max(96),
  weight: z.union(
    WEIGHTS.map((w) => z.literal(w)) as [z.ZodLiteral<Weight>, ...z.ZodLiteral<Weight>[]],
  ),
  lineHeight: z.number().min(0.9).max(2.4),
  /** In em; applied to Latin text only. */
  letterSpacing: z.number().min(-0.05).max(0.3),
  arabicLineHeight: z.number().min(1).max(2.6),
});

export type TextStyle = z.infer<typeof textStyleSchema>;

export const typographySchema = z.strictObject({
  fonts: z.strictObject({ heading: pairSchema, body: pairSchema }),
  styles: z.strictObject(
    Object.fromEntries(TEXT_STYLES.map((id) => [id, textStyleSchema])) as Record<
      TextStyleId,
      typeof textStyleSchema
    >,
  ),
});

export type Typography = z.infer<typeof typographySchema>;

const nearestWeight = (value: number): Weight =>
  WEIGHTS.reduce((best, w) => (Math.abs(w - value) < Math.abs(best - value) ? w : best));

/**
 * A complete set of text styles from a base size and a ratio, used by the built-in presets
 * and to upgrade themes saved before text styles existed.
 */
export function textStylesFrom(options: {
  baseSize: number;
  scale: number;
  bodyWeight: Weight;
  headingWeight: Weight;
}): Typography['styles'] {
  const { baseSize: base, scale, bodyWeight, headingWeight } = options;
  const step = (n: number) => Math.round(base * scale ** n);
  const heading = (size: number, lineHeight: number, letterSpacing: number, arabic: number) => ({
    font: 'heading' as const,
    size,
    weight: headingWeight,
    lineHeight,
    letterSpacing,
    arabicLineHeight: arabic,
  });
  return {
    display: heading(Math.max(step(5), 32), 1.1, -0.02, 1.35),
    h1: heading(Math.max(step(4), 28), 1.15, -0.01, 1.4),
    h2: heading(Math.max(step(3), 22), 1.2, 0, 1.45),
    h3: heading(Math.max(step(2), 18), 1.3, 0, 1.5),
    body: {
      font: 'body',
      size: base,
      weight: bodyWeight,
      lineHeight: 1.6,
      letterSpacing: 0,
      arabicLineHeight: 1.8,
    },
    small: {
      font: 'body',
      size: Math.max(Math.round(base / scale), 12),
      weight: bodyWeight,
      lineHeight: 1.5,
      letterSpacing: 0,
      arabicLineHeight: 1.7,
    },
    nav: {
      font: 'body',
      size: Math.max(base - 1, 13),
      weight: 500,
      lineHeight: 1.4,
      letterSpacing: 0,
      arabicLineHeight: 1.6,
    },
    button: {
      font: 'body',
      size: Math.max(base - 1, 13),
      weight: nearestWeight(Math.max(headingWeight - 100, 500)),
      lineHeight: 1.2,
      letterSpacing: 0.01,
      arabicLineHeight: 1.5,
    },
    label: {
      font: 'body',
      size: Math.max(base - 3, 12),
      weight: 600,
      lineHeight: 1.3,
      letterSpacing: 0.04,
      arabicLineHeight: 1.5,
    },
    productTitle: {
      font: 'heading',
      size: step(2),
      weight: nearestWeight(Math.max(headingWeight - 100, 500)),
      lineHeight: 1.3,
      letterSpacing: 0,
      arabicLineHeight: 1.5,
    },
    price: {
      font: 'heading',
      size: step(1),
      weight: headingWeight,
      lineHeight: 1.2,
      letterSpacing: 0,
      arabicLineHeight: 1.4,
    },
    spec: {
      font: 'body',
      size: Math.max(base - 2, 13),
      weight: 500,
      lineHeight: 1.5,
      letterSpacing: 0,
      arabicLineHeight: 1.7,
    },
  };
}

/** Curated typography presets (D-032): pairings from the font library, with their styles. */
export const TYPOGRAPHY_PRESETS: readonly {
  id: string;
  name: { ar: string; en: string };
  typography: Typography;
}[] = [
  {
    id: 'brand',
    name: { ar: 'هوية Hantex Ultra: ‏Poppins وCairo', en: 'Hantex Ultra brand: Poppins + Cairo' },
    typography: {
      fonts: {
        heading: { latin: 'poppins', arabic: 'cairo' },
        body: { latin: 'poppins', arabic: 'cairo' },
      },
      styles: textStylesFrom({ baseSize: 16, scale: 1.25, bodyWeight: 400, headingWeight: 700 }),
    },
  },
  {
    id: 'modern',
    name: { ar: 'حديث: ‏Inter وIBM Plex', en: 'Modern: Inter + IBM Plex Sans Arabic' },
    typography: {
      fonts: {
        heading: { latin: 'inter', arabic: 'ibm-plex-sans-arabic' },
        body: { latin: 'inter', arabic: 'ibm-plex-sans-arabic' },
      },
      styles: textStylesFrom({ baseSize: 16, scale: 1.2, bodyWeight: 400, headingWeight: 600 }),
    },
  },
  {
    id: 'editorial',
    name: {
      ar: 'عناوين بارزة: ‏Poppins وCairo مع Inter',
      en: 'Bold headings: Poppins + Inter body',
    },
    typography: {
      fonts: {
        heading: { latin: 'poppins', arabic: 'cairo' },
        body: { latin: 'inter', arabic: 'ibm-plex-sans-arabic' },
      },
      styles: textStylesFrom({ baseSize: 17, scale: 1.3, bodyWeight: 400, headingWeight: 700 }),
    },
  },
  {
    id: 'compact',
    name: { ar: 'مدمج: ‏Inter وTajawal', en: 'Compact: Inter + Tajawal' },
    typography: {
      fonts: {
        heading: { latin: 'inter', arabic: 'tajawal' },
        body: { latin: 'inter', arabic: 'tajawal' },
      },
      styles: textStylesFrom({ baseSize: 15, scale: 1.2, bodyWeight: 400, headingWeight: 700 }),
    },
  },
];

export interface TypographyIssue {
  style: TextStyleId;
  code: 'too-small' | 'line-height-too-tight' | 'arabic-line-height-too-tight';
  minimum: number;
}

/** Readability checks; any issue blocks publishing, like a contrast failure. */
export function checkTypography(typography: Typography): TypographyIssue[] {
  const issues: TypographyIssue[] = [];
  for (const id of TEXT_STYLES) {
    const style = typography.styles[id];
    const limits = STYLE_LIMITS[id];
    if (style.size < limits.minSize) {
      issues.push({ style: id, code: 'too-small', minimum: limits.minSize });
    }
    if (style.lineHeight < limits.minLineHeight) {
      issues.push({ style: id, code: 'line-height-too-tight', minimum: limits.minLineHeight });
    }
    // Arabic letters reach higher and lower than Latin ones, so they need at least as much room.
    if (style.arabicLineHeight < style.lineHeight) {
      issues.push({
        style: id,
        code: 'arabic-line-height-too-tight',
        minimum: style.lineHeight,
      });
    }
  }
  return issues;
}

/** The weights each font must ship for each script, from the styles that use it. */
export function fontsInUse(
  typography: Typography,
): Map<FontRef, Map<'latin' | 'arabic', Set<Weight>>> {
  const used = new Map<FontRef, Map<'latin' | 'arabic', Set<Weight>>>();
  for (const id of TEXT_STYLES) {
    const style = typography.styles[id];
    const pair = typography.fonts[style.font];
    for (const script of ['latin', 'arabic'] as const) {
      const scripts = used.get(pair[script]) ?? new Map<'latin' | 'arabic', Set<Weight>>();
      const weights = scripts.get(script) ?? new Set<Weight>();
      weights.add(style.weight);
      scripts.set(script, weights);
      used.set(pair[script], scripts);
    }
  }
  return used;
}

/** The closest weight a font actually ships (e.g. Tajawal has no 600). */
export function availableWeight(
  font: FontRef,
  weight: number,
  catalogue: FontCatalogue = BUILT_IN_FONTS,
): number {
  const available = catalogue.get(font)?.weights ?? [];
  return available.reduce(
    (best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best),
    available[0] ?? weight,
  );
}

export interface FontIssue {
  role: FontRole;
  script: 'latin' | 'arabic';
  font: FontRef;
  /** missing: not in the font library (deleted?); script: doesn't write that script. */
  problem: 'missing' | 'script';
}

/** Fonts the theme uses that the library doesn't have, or that can't write their script. */
export function checkThemeFonts(typography: Typography, catalogue: FontCatalogue): FontIssue[] {
  const issues: FontIssue[] = [];
  for (const role of FONT_ROLES) {
    for (const script of ['latin', 'arabic'] as const) {
      const font = typography.fonts[role][script];
      const entry = catalogue.get(font);
      if (!entry) issues.push({ role, script, font, problem: 'missing' });
      else if (!entry.scripts.includes(script))
        issues.push({ role, script, font, problem: 'script' });
    }
  }
  return issues;
}
