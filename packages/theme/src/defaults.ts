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
    arabic: 'readex-pro',
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
