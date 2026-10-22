import { describe, expect, it } from 'vitest';
import { readWebp } from '../src/lib/webp';
import { fakeWebp } from './fixtures';

describe('WebP header check', () => {
  it('reads the size of a lossless WebP', () => {
    expect(readWebp(fakeWebp(960, 640))).toEqual({ width: 960, height: 640 });
  });

  it('refuses other files, extra bytes after the image and truncated headers', () => {
    const png = new Uint8Array(64);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    expect(readWebp(png.buffer)).toBeNull();
    const padded = new Uint8Array(fakeWebp(10, 10).byteLength + 4);
    padded.set(new Uint8Array(fakeWebp(10, 10)));
    expect(readWebp(padded.buffer)).toBeNull();
    expect(readWebp(new Uint8Array(12).buffer)).toBeNull();
  });
});
