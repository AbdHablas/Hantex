import { brotliCompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readWoff2 } from '../src/lib/woff2';
import { fontFile } from './font-files';

const cairoLatin = () => fontFile('cairo', 'cairo-latin-400-normal.woff2');

describe('WOFF2 reader', () => {
  it('reads a real font’s name, weight and scripts from the file', () => {
    expect(readWoff2(cairoLatin())).toEqual({
      ok: true,
      info: { family: 'Cairo', weight: 400, italic: false, scripts: ['latin'] },
    });
    expect(readWoff2(fontFile('tajawal', 'tajawal-arabic-700-normal.woff2'))).toEqual({
      ok: true,
      info: { family: 'Tajawal', weight: 700, italic: false, scripts: ['arabic'] },
    });
  });

  it('refuses files that aren’t WOFF2 fonts', () => {
    expect(readWoff2(new TextEncoder().encode('<svg/>').buffer as ArrayBuffer)).toEqual({
      ok: false,
      reason: 'not-woff2',
    });
    expect(readWoff2(fontFile('cairo', 'cairo-latin-400-normal.woff'))).toMatchObject({
      ok: false,
      reason: 'not-woff2',
    });
  });

  it('refuses a file with anything added after the font', () => {
    const font = new Uint8Array(cairoLatin());
    const longer = new Uint8Array(font.length + 4);
    longer.set(font);
    expect(readWoff2(longer.buffer)).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('refuses a cut-off or damaged file', () => {
    const font = new Uint8Array(cairoLatin());
    const cut = font.slice(0, font.length - 100);
    new DataView(cut.buffer).setUint32(8, cut.length);
    expect(readWoff2(cut.buffer)).toMatchObject({ ok: false, reason: 'malformed' });
    const damaged = font.slice();
    for (let i = 200; i < 260; i++) damaged[i] = 0xff;
    expect(readWoff2(damaged.buffer)).toMatchObject({ ok: false });
  });

  it('refuses compressed data that unpacks to more than the directory promises', () => {
    // A tiny file claiming one small table, whose data unpacks to 30 MB.
    const bomb = brotliCompressSync(new Uint8Array(30 * 1024 * 1024));
    const header = new Uint8Array(48 + 2 + bomb.length);
    const view = new DataView(header.buffer);
    header.set([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]);
    view.setUint32(8, header.length);
    view.setUint16(12, 1);
    view.setUint32(16, 100);
    view.setUint32(20, bomb.length);
    header.set([0x01, 0x10], 48); // head, 16 bytes
    header.set(bomb, 50);
    expect(readWoff2(header.buffer)).toMatchObject({ ok: false });
  });
});
