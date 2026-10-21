import { describe, expect, it } from 'vitest';
import { brandTheme } from './defaults';
import { checkTypography, TYPOGRAPHY_PRESETS } from './typography';
import { publishable, validateTheme } from './validate';

const clone = () => structuredClone(brandTheme);

describe('validateTheme', () => {
  it('passes the brand theme in both modes with no errors or warnings', () => {
    expect(validateTheme(brandTheme)).toEqual({ errors: [], typography: [], warnings: [] });
  });

  it('blocks text that fails WCAG AA, naming the mode and the pair', () => {
    const theme = clone();
    theme.colors.dark.textMuted = '#3A3F48';
    const { errors } = validateTheme(theme);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContainEqual(
      expect.objectContaining({
        mode: 'dark',
        foreground: 'textMuted',
        background: 'background',
        minimum: 4.5,
      }),
    );
  });

  it('requires readable text on accent-coloured buttons', () => {
    const theme = clone();
    theme.colors.light.accentContrast = '#FFFFFF';
    expect(validateTheme(theme).errors).toContainEqual(
      expect.objectContaining({
        mode: 'light',
        foreground: 'accentContrast',
        background: 'accent',
      }),
    );
  });

  it('requires 3:1 for focus rings and form borders (non-text contrast)', () => {
    const theme = clone();
    theme.colors.light.focusRing = '#E0E4E8';
    theme.colors.light.inputBorder = '#EEF0F2';
    const pairs = validateTheme(theme).errors.map((e) => `${e.foreground}/${e.minimum}`);
    expect(pairs).toContain('focusRing/3');
    expect(pairs).toContain('inputBorder/3');
  });

  it('warns, but does not block, when the logo would be hard to see', () => {
    const theme = clone();
    theme.logo.dark.neutral = '#22262A';
    const result = validateTheme(theme);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ mode: 'dark', code: 'logo-low-visibility' }),
    );
  });

  it('warns when logo colours differ from the brand colours', () => {
    const theme = clone();
    theme.logo.light.switch = '#AA3366';
    expect(validateTheme(theme).warnings).toContainEqual(
      expect.objectContaining({ mode: 'light', code: 'logo-off-brand' }),
    );
  });
});

describe('built-in presets', () => {
  it('pass the contrast checks and the schema', async () => {
    const { BUILT_IN_PRESETS } = await import('./defaults');
    const { themeSchema } = await import('./schema');
    for (const preset of BUILT_IN_PRESETS) {
      expect(themeSchema.safeParse(preset.theme).success, preset.id).toBe(true);
      expect(validateTheme(preset.theme).errors, preset.id).toEqual([]);
    }
  });

  it('blocks text that is too small or too tightly spaced, in Latin and Arabic', () => {
    const theme = structuredClone(brandTheme);
    theme.typography.styles.body.size = 12;
    theme.typography.styles.small.lineHeight = 1.1;
    theme.typography.styles.h2.arabicLineHeight = 1;
    theme.typography.styles.h2.lineHeight = 1.2;
    const checks = validateTheme(theme);
    expect(checks.typography).toEqual(
      expect.arrayContaining([
        { style: 'body', code: 'too-small', minimum: 14 },
        { style: 'small', code: 'line-height-too-tight', minimum: 1.3 },
        { style: 'h2', code: 'arabic-line-height-too-tight', minimum: 1.2 },
      ]),
    );
    expect(publishable(checks)).toBe(false);
    expect(publishable(validateTheme(brandTheme))).toBe(true);
  });

  it('ships typography presets that pass every check', () => {
    for (const preset of TYPOGRAPHY_PRESETS) {
      const theme = { ...structuredClone(brandTheme), typography: preset.typography };
      expect(checkTypography(theme.typography), preset.id).toEqual([]);
    }
  });
});
