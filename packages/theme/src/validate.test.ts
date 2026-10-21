import { describe, expect, it } from 'vitest';
import { brandTheme } from './defaults';
import { validateTheme } from './validate';

const clone = () => structuredClone(brandTheme);

describe('validateTheme', () => {
  it('passes the brand theme in both modes with no errors or warnings', () => {
    expect(validateTheme(brandTheme)).toEqual({ errors: [], warnings: [] });
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
