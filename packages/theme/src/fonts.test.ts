import { describe, expect, it } from 'vitest';
import { themeToCss } from './css';
import { brandTheme } from './defaults';
import { fontCatalogue, uploadedFontId } from './fonts';
import { themeSchema } from './schema';
import { availableWeight, checkThemeFonts } from './typography';

const ID = uploadedFontId('0b6f4a52-9a1e-4b0c-8d7e-1f2a3b4c5d6e');
const uploaded = fontCatalogue([
  { id: ID, name: 'Test Sans', scripts: ['latin', 'arabic'], weights: [400, 700] },
]);
const withUpload = () => {
  const theme = structuredClone(brandTheme);
  theme.typography.fonts.body = { latin: ID, arabic: ID };
  return theme;
};

describe('uploaded fonts in a theme (D-033)', () => {
  it('accepts an uploaded font’s id, and nothing that only looks like one', () => {
    expect(themeSchema.safeParse(withUpload()).success).toBe(true);
    const bad = structuredClone(brandTheme) as unknown as {
      typography: { fonts: { body: { latin: string } } };
    };
    bad.typography.fonts.body.latin = 'upload-"; } body { color: red';
    expect(themeSchema.safeParse(bad).success).toBe(false);
  });

  it('names uploaded fonts in CSS by their id, so names never clash or need escaping', () => {
    const css = themeToCss(withUpload(), uploaded);
    expect(css).toContain(`--hx-font-body: "${ID}", "${ID}", system-ui, sans-serif;`);
    // Without the catalogue the font is left out, and the page falls back to system fonts.
    expect(themeToCss(withUpload())).toContain('--hx-font-body: system-ui, sans-serif;');
  });

  it('finds fonts that are missing or can’t write their script', () => {
    expect(checkThemeFonts(withUpload().typography, uploaded)).toEqual([]);
    expect(checkThemeFonts(withUpload().typography, fontCatalogue())).toHaveLength(2);
    const latinOnly = fontCatalogue([
      { id: ID, name: 'Test Sans', scripts: ['latin'], weights: [400] },
    ]);
    expect(checkThemeFonts(withUpload().typography, latinOnly)).toEqual([
      { role: 'body', script: 'arabic', font: ID, problem: 'script' },
    ]);
  });

  it('picks the nearest weight an uploaded font ships', () => {
    expect(availableWeight(ID, 600, uploaded)).toBe(700);
    expect(availableWeight(ID, 300, uploaded)).toBe(400);
    expect(availableWeight('tajawal', 600)).toBe(500);
  });
});

describe('uploaded font files', () => {
  it('writes @font-face rules only for the uploaded fonts in use, at the nearest weight', async () => {
    const { uploadedFontFaces } = await import('./css');
    const css = uploadedFontFaces(withUpload(), uploaded);
    const uuid = ID.slice('upload-'.length);
    expect(css).toContain(`font-family: "${ID}"`);
    expect(css).toContain(`src: url("/fonts/library/${uuid}/400.woff2") format("woff2");`);
    // Medium (500) is always included; this font has no 500, so it uses 400.
    expect(css).toMatch(
      /font-weight: 500;\n {2}font-display: swap;\n {2}src: url\("[^"]*\/400\.woff2"\)/,
    );
    expect(uploadedFontFaces(brandTheme, uploaded)).toBe('');
  });
});
