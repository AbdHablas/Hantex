import { contrastRatio } from './color';
import { brandTheme } from './defaults';
import { MODES, type ColorToken, type Mode, type Theme } from './schema';
import { checkTypography, type TypographyIssue } from './typography';

export interface ContrastIssue {
  mode: Mode;
  foreground: ColorToken;
  background: ColorToken;
  ratio: number;
  minimum: number;
}

export interface ThemeWarning {
  mode: Mode;
  code: 'logo-low-visibility' | 'logo-off-brand';
  message: string;
}

/** Pairs that must be readable (WCAG 2.1 AA: 4.5 for text, 3 for focus and input borders). */
const RULES: { foreground: ColorToken; backgrounds: ColorToken[]; minimum: number }[] = [
  { foreground: 'text', backgrounds: ['background', 'surface', 'surfaceRaised'], minimum: 4.5 },
  {
    foreground: 'textMuted',
    backgrounds: ['background', 'surface', 'surfaceRaised'],
    minimum: 4.5,
  },
  { foreground: 'accentText', backgrounds: ['background', 'surface'], minimum: 4.5 },
  { foreground: 'accentContrast', backgrounds: ['accent'], minimum: 4.5 },
  { foreground: 'success', backgrounds: ['background', 'surface'], minimum: 4.5 },
  { foreground: 'warning', backgrounds: ['background', 'surface'], minimum: 4.5 },
  { foreground: 'danger', backgrounds: ['background', 'surface'], minimum: 4.5 },
  { foreground: 'focusRing', backgrounds: ['background', 'surface'], minimum: 3 },
  { foreground: 'inputBorder', backgrounds: ['surface'], minimum: 3 },
];

const LOGO_MIN_VISIBILITY = 3;
const round = (n: number) => Math.round(n * 100) / 100;

export interface ThemeChecks {
  errors: ContrastIssue[];
  typography: TypographyIssue[];
  warnings: ThemeWarning[];
}

/** True when nothing blocks publishing (contrast and readability). */
export const publishable = (checks: ThemeChecks) =>
  checks.errors.length === 0 && checks.typography.length === 0;

/**
 * Checks a theme before it can be published. Contrast errors and typography issues block
 * publishing; warnings need the administrator's confirmation (logo colours, D-022).
 */
export function validateTheme(theme: Theme): ThemeChecks {
  const errors: ContrastIssue[] = [];
  const warnings: ThemeWarning[] = [];

  for (const mode of MODES) {
    const colors = theme.colors[mode];
    for (const rule of RULES) {
      for (const background of rule.backgrounds) {
        const ratio = contrastRatio(colors[rule.foreground], colors[background]);
        if (ratio < rule.minimum) {
          errors.push({
            mode,
            foreground: rule.foreground,
            background,
            ratio: round(ratio),
            minimum: rule.minimum,
          });
        }
      }
    }

    const logo = theme.logo[mode];
    const visibility = contrastRatio(logo.neutral, colors.background);
    if (visibility < LOGO_MIN_VISIBILITY) {
      warnings.push({
        mode,
        code: 'logo-low-visibility',
        message: `The logo outline is hard to see on the ${mode} background (${round(visibility)}:1).`,
      });
    }

    const brand = brandTheme.logo[mode];
    const offBrand = (Object.keys(brand) as (keyof typeof brand)[]).some(
      (key) => logo[key].toUpperCase() !== brand[key].toUpperCase(),
    );
    if (offBrand) {
      warnings.push({
        mode,
        code: 'logo-off-brand',
        message: `The ${mode} logo colours differ from the brand guidelines, which say the mark must not be recoloured.`,
      });
    }
  }

  return { errors, typography: checkTypography(theme.typography), warnings };
}
