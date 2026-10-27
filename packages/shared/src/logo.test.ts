import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adaptiveLogo, logoFileSchema, logoSchema, newLogoFile, type LogoPalette } from './logo';
import { sanitizeSvg } from './svg';

const brand = (file: string) =>
  readFileSync(new URL(`../../../brand/logo/${file}`, import.meta.url), 'utf8');
const cleaned = (input: string) => {
  const result = sanitizeSvg(input);
  if (!result.ok) throw new Error(result.reason);
  return newLogoFile(result.svg, result.colours);
};
const palette: LogoPalette = {
  light: { neutral: '#1B1E24', switch: '#1FB6C9', indicator: '#F4F6F8', accent: '#1FB6C9' },
  dark: { neutral: '#F4F6F8', switch: '#1FB6C9', indicator: '#1B1E24', accent: '#1FB6C9' },
};

describe('uploaded logos', () => {
  it('accepts a cleaned file with every colour listed', () => {
    const file = cleaned(brand('mark.svg'));
    expect(logoFileSchema.safeParse(file).success).toBe(true);
    expect(logoSchema.safeParse({ lockup: file, mark: null }).success).toBe(true);
  });

  it('refuses a file the cleaner would change, so nothing unchecked is stored', () => {
    const file = cleaned(brand('mark.svg'));
    const sneaky = file.svg.replace('<title>', '<script>alert(1)</script><title>');
    expect(logoFileSchema.safeParse({ ...file, svg: sneaky }).success).toBe(false);
    expect(logoFileSchema.safeParse({ ...file, svg: brand('mark.svg') }).success).toBe(false);
  });

  it('refuses a colour list that doesn’t match the file', () => {
    const file = cleaned(brand('mark.svg'));
    expect(logoFileSchema.safeParse({ ...file, colours: file.colours.slice(1) }).success).toBe(
      false,
    );
    const extra = [...file.colours, { colour: '#123456', use: 'fixed' as const }];
    expect(logoFileSchema.safeParse({ ...file, colours: extra }).success).toBe(false);
  });

  it('leaves a logo with only fixed colours as it is', () => {
    const file = cleaned(brand('mark.svg'));
    expect(adaptiveLogo(file, palette)).toBe(file.svg);
  });

  it('draws mapped colours with the theme’s light and dark logo colours', () => {
    const file = cleaned(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#112233"/><circle r="2" stroke="#445566" fill="#778899"/></svg>`,
    );
    file.colours = file.colours.map((c) =>
      c.colour === '#112233'
        ? { ...c, use: 'neutral' }
        : c.colour === '#445566'
          ? { ...c, use: 'accent' }
          : c,
    );
    const svg = adaptiveLogo(file, palette);
    expect(svg).toMatch(/<rect[^>]* class="hx-f-neutral"/);
    expect(svg).toMatch(/<circle[^>]* class="hx-s-accent"/);
    // The unmapped fill stays fixed, with no class.
    expect(svg).toMatch(/<circle[^>]*fill="#778899"/);
    expect(svg).toContain('svg{--_hx-neutral:#1B1E24;--_hx-accent:#1FB6C9}');
    expect(svg).toContain(
      '@media (prefers-color-scheme:dark){svg{--_hx-neutral:#F4F6F8;--_hx-accent:#1FB6C9}}',
    );
    expect(svg).toContain('.hx-f-neutral{fill:var(--hx-logo-neutral,var(--_hx-neutral))}');
    expect(svg).toContain('.hx-s-accent{stroke:var(--hx-logo-accent,var(--_hx-accent))}');
    expect(svg.indexOf('<style>')).toBe(svg.indexOf('>') + 1);
  });

  it('never writes a palette value that isn’t a plain colour', () => {
    const file = cleaned(brand('mark.svg'));
    file.colours = file.colours.map((c) => ({ ...c, use: 'neutral' }));
    const bad = { ...palette, dark: { ...palette.dark, neutral: 'red}</style><script>' } };
    expect(() => adaptiveLogo(file, bad)).toThrow();
  });

  it('only writes class names the cleaner allows', () => {
    const result = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1" fill="#000"/></svg>`,
      undefined,
      { paint: () => 'x" onload="alert(1)' },
    );
    expect(result.ok && result.svg).not.toContain('class');
  });
});
