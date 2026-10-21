import { describe, expect, it } from 'vitest';
import { brandTheme } from './defaults';
import { themeSchema, upgradeTheme } from './schema';
import { textStylesFrom } from './typography';

const clone = () => structuredClone(brandTheme);

describe('themeSchema', () => {
  it('accepts the brand theme', () => {
    expect(themeSchema.parse(brandTheme)).toEqual(brandTheme);
  });

  it('rejects colours that are not six-digit hex', () => {
    const theme = clone() as unknown as { colors: { light: { text: string } } };
    theme.colors.light.text = 'red';
    expect(themeSchema.safeParse(theme).success).toBe(false);
  });

  it('rejects fonts that are not in the font library, or in the wrong script', () => {
    const unknown = clone() as unknown as { typography: { fonts: { body: { latin: string } } } };
    unknown.typography.fonts.body.latin = 'comic-sans';
    expect(themeSchema.safeParse(unknown).success).toBe(false);

    const wrongScript = clone() as unknown as {
      typography: { fonts: { heading: { arabic: string } } };
    };
    wrongScript.typography.fonts.heading.arabic = 'poppins';
    expect(themeSchema.safeParse(wrongScript).success).toBe(false);
  });

  it('rejects out-of-range sizes and radii', () => {
    const big = clone();
    big.typography.styles.body.size = 200;
    expect(themeSchema.safeParse(big).success).toBe(false);

    const radius = clone() as unknown as { shape: { radius: number } };
    radius.shape.radius = -1;
    expect(themeSchema.safeParse(radius).success).toBe(false);
  });

  it('rejects unknown keys, so no free-form CSS can be smuggled in', () => {
    const theme = { ...clone(), customCss: 'body{display:none}' };
    expect(themeSchema.safeParse(theme).success).toBe(false);
  });

  it('upgrades themes saved before text styles existed, keeping their fonts and sizes', () => {
    const { typography: _typography, ...rest } = clone();
    const old = {
      ...rest,
      version: 1,
      typography: {
        latin: 'inter',
        arabic: 'tajawal',
        baseSize: 17,
        scale: 1.2,
        bodyWeight: 300,
        headingWeight: 600,
      },
    };
    const parsed = themeSchema.parse(old);
    expect(parsed.version).toBe(2);
    expect(parsed.typography.fonts.heading).toEqual({ latin: 'inter', arabic: 'tajawal' });
    expect(parsed.typography.fonts.body).toEqual({ latin: 'inter', arabic: 'tajawal' });
    expect(parsed.typography.styles).toEqual(
      textStylesFrom({ baseSize: 17, scale: 1.2, bodyWeight: 300, headingWeight: 600 }),
    );
    expect(parsed.typography.styles.body.size).toBe(17);
    // A current theme passes through untouched.
    expect(upgradeTheme(brandTheme)).toBe(brandTheme);
  });
});
