import { describe, expect, it } from 'vitest';
import { widthsFor } from './media';

describe('stored image widths', () => {
  it('never enlarges, and keeps the largest the original allows', () => {
    expect(widthsFor(300)).toEqual([300]);
    expect(widthsFor(1200)).toEqual([480, 960, 1200]);
    expect(widthsFor(1600)).toEqual([480, 960, 1600]);
    expect(widthsFor(4000)).toEqual([480, 960, 1600, 2400]);
  });
});
