import { describe, expect, it } from 'vitest';
import { brandTheme } from './defaults';
import { themeSchema } from './schema';

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
    const unknown = clone() as unknown as { typography: { latin: string } };
    unknown.typography.latin = 'comic-sans';
    expect(themeSchema.safeParse(unknown).success).toBe(false);

    const wrongScript = clone() as unknown as { typography: { arabic: string } };
    wrongScript.typography.arabic = 'poppins';
    expect(themeSchema.safeParse(wrongScript).success).toBe(false);
  });

  it('rejects out-of-range sizes and radii', () => {
    const big = clone() as unknown as { typography: { baseSize: number } };
    big.typography.baseSize = 40;
    expect(themeSchema.safeParse(big).success).toBe(false);

    const radius = clone() as unknown as { shape: { radius: number } };
    radius.shape.radius = -1;
    expect(themeSchema.safeParse(radius).success).toBe(false);
  });

  it('rejects unknown keys, so no free-form CSS can be smuggled in', () => {
    const theme = { ...clone(), customCss: 'body{display:none}' };
    expect(themeSchema.safeParse(theme).success).toBe(false);
  });
});
