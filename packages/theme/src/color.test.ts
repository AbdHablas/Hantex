import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex } from './color';

describe('parseHex', () => {
  it('reads six-digit hex colours, case-insensitively', () => {
    expect(parseHex('#1FB6C9')).toEqual({ r: 31, g: 182, b: 201 });
    expect(parseHex('#1fb6c9')).toEqual({ r: 31, g: 182, b: 201 });
  });

  it('rejects anything else', () => {
    expect(() => parseHex('1FB6C9')).toThrow();
    expect(() => parseHex('#FFF')).toThrow();
    expect(() => parseHex('red')).toThrow();
  });
});

describe('contrastRatio (WCAG 2.1)', () => {
  it('is 21:1 for black on white, in either order', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1:1 for identical colours', () => {
    expect(contrastRatio('#1B1E24', '#1B1E24')).toBe(1);
  });

  it('matches the brand palette figures in docs/brand-guidelines.md', () => {
    expect(contrastRatio('#F4F6F8', '#1B1E24')).toBeCloseTo(15.41, 2);
    expect(contrastRatio('#1FB6C9', '#1B1E24')).toBeCloseTo(6.83, 2);
    expect(contrastRatio('#7B818C', '#1B1E24')).toBeCloseTo(4.26, 2);
    expect(contrastRatio('#1FB6C9', '#F4F6F8')).toBeCloseTo(2.26, 2);
  });
});
