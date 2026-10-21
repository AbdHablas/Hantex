import { describe, expect, it } from 'vitest';
import { BRAND_NAME } from './index';

describe('theme package', () => {
  it('exports the brand name', () => {
    expect(BRAND_NAME).toBe('Hantex Ultra');
  });
});
