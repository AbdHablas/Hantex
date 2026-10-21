import { z } from 'zod';
import { fontsForScript, type FontId } from './fonts';

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

const fontFor = (script: 'latin' | 'arabic') => {
  const ids = fontsForScript(script);
  return z.enum(ids as [FontId, ...FontId[]]);
};

export const MODES = ['light', 'dark'] as const;
export type Mode = (typeof MODES)[number];

export const themeSchema = z.strictObject({
  version: z.literal(1),
  colors: z.strictObject({ light: colorsSchema, dark: colorsSchema }),
  logo: z.strictObject({ light: logoSchema, dark: logoSchema }),
  typography: z.strictObject({
    latin: fontFor('latin'),
    arabic: fontFor('arabic'),
    baseSize: z.number().int().min(14).max(20),
    scale: z.number().min(1.1).max(1.5),
    bodyWeight: z.union([z.literal(300), z.literal(400), z.literal(500)]),
    headingWeight: z.union([z.literal(500), z.literal(600), z.literal(700)]),
  }),
  shape: z.strictObject({ radius: z.number().int().min(0).max(32) }),
  depth: z.strictObject({ shadow: z.enum(['none', 'soft', 'strong']) }),
  motion: z.enum(['off', 'subtle', 'full']),
  mode: z.strictObject({
    default: z.enum(['system', 'light', 'dark']),
    allowToggle: z.boolean(),
  }),
});

export type Theme = z.infer<typeof themeSchema>;
export type ThemeColors = Theme['colors']['light'];
export type LogoColors = Theme['logo']['light'];
