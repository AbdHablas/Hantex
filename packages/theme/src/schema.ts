import { z } from 'zod';
import { textStylesFrom, typographySchema, type Weight } from './typography';

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour, for example #1B1E24');

/** Semantic colour tokens; components use only these (docs/theming.md). */
export const COLOR_TOKENS = [
  'background',
  'surface',
  'surfaceRaised',
  'border',
  'inputBorder',
  'text',
  'textMuted',
  'accent',
  'accentContrast',
  'accentText',
  'focusRing',
  'success',
  'warning',
  'danger',
  'glow',
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

const colorsSchema = z.strictObject(
  Object.fromEntries(COLOR_TOKENS.map((token) => [token, hexColor])) as Record<
    ColorToken,
    typeof hexColor
  >,
);

const logoSchema = z.strictObject({
  neutral: hexColor,
  switch: hexColor,
  indicator: hexColor,
  accent: hexColor,
});

export const MODES = ['light', 'dark'] as const;
export type Mode = (typeof MODES)[number];

const themeV2 = z.strictObject({
  version: z.literal(2),
  colors: z.strictObject({ light: colorsSchema, dark: colorsSchema }),
  logo: z.strictObject({ light: logoSchema, dark: logoSchema }),
  typography: typographySchema,
  shape: z.strictObject({ radius: z.number().int().min(0).max(32) }),
  depth: z.strictObject({ shadow: z.enum(['none', 'soft', 'strong']) }),
  motion: z.enum(['off', 'subtle', 'full']),
  mode: z.strictObject({
    default: z.enum(['system', 'light', 'dark']),
    allowToggle: z.boolean(),
  }),
});

/**
 * Themes saved before text styles existed (version 1: two fonts, a base size, a ratio and two
 * weights) are upgraded on read, so stored drafts, published versions and presets keep working.
 */
export function upgradeTheme(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const theme = input as Record<string, unknown>;
  if (theme['version'] !== 1) return input;
  const t = theme['typography'] as
    | {
        latin?: unknown;
        arabic?: unknown;
        baseSize?: number;
        scale?: number;
        bodyWeight?: Weight;
        headingWeight?: Weight;
      }
    | undefined;
  if (!t || typeof t !== 'object') return input;
  const pair = { latin: t.latin, arabic: t.arabic };
  return {
    ...theme,
    version: 2,
    typography: {
      fonts: { heading: pair, body: pair },
      styles: textStylesFrom({
        baseSize: typeof t.baseSize === 'number' ? t.baseSize : 16,
        scale: typeof t.scale === 'number' ? t.scale : 1.25,
        bodyWeight: t.bodyWeight ?? 400,
        headingWeight: t.headingWeight ?? 700,
      }),
    },
  };
}

export const themeSchema = z.preprocess(upgradeTheme, themeV2);

export type Theme = z.infer<typeof themeV2>;
export type ThemeColors = Theme['colors']['light'];
export type LogoColors = Theme['logo']['light'];
