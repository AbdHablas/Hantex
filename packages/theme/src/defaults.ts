import type { Theme } from './schema';

/** Brand palette (brand guidelines, D-012). */
export const BRAND = {
  graphite: '#1B1E24',
  circuitTeal: '#1FB6C9',
  ice: '#F4F6F8',
  steel: '#7B818C',
  volt: '#6EE7F0',
} as const;

/**
 * The brand default theme. Every text pair meets WCAG 2.1 AA in both modes; derived shades
 * (muted text, teal text on light grounds) are documented in docs/brand-guidelines.md.
 */
export const brandTheme: Theme = {
  version: 1,
  colors: {
    light: {
      background: BRAND.ice,
      surface: '#FFFFFF',
      surfaceRaised: '#FFFFFF',
      border: '#DDE2E8',
      inputBorder: '#8A909B',
      text: BRAND.graphite,
      textMuted: '#5F6570',
      accent: BRAND.circuitTeal,
      accentContrast: BRAND.graphite,
      accentText: '#137784',
      focusRing: '#137784',
      success: '#17713F',
      warning: '#8A5300',
      danger: '#B42318',
      glow: BRAND.volt,
    },
    dark: {
      background: BRAND.graphite,
      surface: '#22262D',
      surfaceRaised: '#2A2F37',
      border: '#353A43',
      inputBorder: '#6B717C',
      text: BRAND.ice,
      textMuted: '#9AA0AB',
      accent: BRAND.circuitTeal,
      accentContrast: BRAND.graphite,
      accentText: BRAND.circuitTeal,
      focusRing: BRAND.volt,
      success: '#4ADE80',
      warning: '#FBBF24',
      danger: '#F87171',
      glow: BRAND.volt,
    },
  },
  logo: {
    light: {
      neutral: BRAND.graphite,
      switch: BRAND.circuitTeal,
      indicator: BRAND.ice,
      accent: BRAND.circuitTeal,
    },
    dark: {
      neutral: BRAND.ice,
      switch: BRAND.circuitTeal,
      indicator: BRAND.ice,
      accent: BRAND.circuitTeal,
    },
  },
  typography: {
    latin: 'poppins',
    arabic: 'cairo',
    baseSize: 16,
    scale: 1.25,
    bodyWeight: 400,
    headingWeight: 700,
  },
  shape: { radius: 14 },
  depth: { shadow: 'soft' },
  motion: 'full',
  mode: { default: 'system', allowToggle: true },
};

/**
 * A neutral starting theme for sites that aren't Hantex Ultra (D-027): quiet greys with an
 * indigo accent. It keeps the brand theme's logo colours, which only apply to the Hantex Ultra
 * logo files. Every text pair meets WCAG 2.1 AA in both modes (tested).
 */
export const neutralTheme: Theme = {
  version: 1,
  colors: {
    light: {
      background: '#F7F7F8',
      surface: '#FFFFFF',
      surfaceRaised: '#FFFFFF',
      border: '#E2E4E8',
      inputBorder: '#868B94',
      text: '#18181B',
      textMuted: '#52525B',
      accent: '#3B5BDB',
      accentContrast: '#FFFFFF',
      accentText: '#3451C7',
      focusRing: '#3451C7',
      success: '#15803D',
      warning: '#92400E',
      danger: '#B91C1C',
      glow: '#91A7FF',
    },
    dark: {
      background: '#18181B',
      surface: '#222226',
      surfaceRaised: '#2A2A30',
      border: '#3A3A42',
      inputBorder: '#71717A',
      text: '#F4F4F5',
      textMuted: '#A1A1AA',
      accent: '#91A7FF',
      accentContrast: '#18181B',
      accentText: '#91A7FF',
      focusRing: '#91A7FF',
      success: '#4ADE80',
      warning: '#FBBF24',
      danger: '#F87171',
      glow: '#91A7FF',
    },
  },
  logo: brandTheme.logo,
  typography: {
    latin: 'inter',
    arabic: 'ibm-plex-sans-arabic',
    baseSize: 16,
    scale: 1.2,
    bodyWeight: 400,
    headingWeight: 600,
  },
  shape: { radius: 8 },
  depth: { shadow: 'soft' },
  motion: 'subtle',
  mode: { default: 'system', allowToggle: true },
};

/** The built-in starting themes, offered when creating a site and in the appearance editor. */
export const BUILT_IN_PRESETS = [
  { id: 'brand', name: { ar: 'هوية Hantex Ultra', en: 'Hantex Ultra brand' }, theme: brandTheme },
  { id: 'neutral', name: { ar: 'محايد', en: 'Neutral starter' }, theme: neutralTheme },
] as const;
