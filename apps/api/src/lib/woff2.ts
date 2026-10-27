import { brotliDecompressSync } from 'node:zlib';

/**
 * Reads an uploaded WOFF2 font (D-033) before it is accepted: the header and table directory
 * must describe exactly this file, the font data must decompress to the size the directory
 * promises, and the tables a web font needs must be there. The font's own name, weight and the
 * scripts it can write (from its character map) are read from the data, not taken from the
 * upload form. Nothing is executed or rendered here.
 */
export interface FontInfo {
  /** The family name the font gives itself (name table, typographic family first). */
  family: string;
  /** usWeightClass from the OS/2 table, rounded to a CSS weight (100–900). */
  weight: number;
  italic: boolean;
  /** The scripts whose basic letters the font draws. */
  scripts: ('latin' | 'arabic')[];
}

export type FontProblem =
  'too-large' | 'not-woff2' | 'collection' | 'malformed' | 'missing-tables' | 'no-letters';

export const FONT_MAX_BYTES = 2 * 1024 * 1024;
/** Fonts larger than this when unpacked are refused (a decompression bomb guard). */
const MAX_SFNT_BYTES = 20 * 1024 * 1024;

const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];
const REQUIRED = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post'];

/** Letters a font must draw to count as writing a script. */
const LETTERS = {
  latin: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'],
  // The 28 letters of the Arabic alphabet (with hamza and ta marbuta), and Arabic-Indic digits.
  arabic: [...'ءابةتثجحخدذرزسشصضطظعغفقكلمنهوي٠١٢٣٤٥٦٧٨٩'],
};

class Bad extends Error {
  constructor(readonly problem: FontProblem) {
    super(problem);
  }
}

const tag = (b: Uint8Array, at: number) => String.fromCharCode(...b.subarray(at, at + 4));

/** WOFF2's variable-length unsigned integer (at most five bytes, no leading zeros). */
function base128(b: Uint8Array, at: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = b[at + i];
    if (byte === undefined || (i === 0 && byte === 0x80)) throw new Bad('malformed');
    if (value & 0xfe000000) throw new Bad('malformed');
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value >>> 0, at + i + 1];
  }
  throw new Bad('malformed');
}

interface Table {
  tag: string;
  offset: number;
  length: number;
  transformed: boolean;
}

export function readWoff2(
  buffer: ArrayBuffer,
): { ok: true; info: FontInfo } | { ok: false; reason: FontProblem } {
  try {
    return { ok: true, info: read(new Uint8Array(buffer)) };
  } catch (error) {
    if (error instanceof Bad) return { ok: false, reason: error.problem };
    // Anything the parser didn't foresee (a truncated table, a broken stream) is a bad file.
    return { ok: false, reason: 'malformed' };
  }
}

function read(b: Uint8Array): FontInfo {
  if (b.length > FONT_MAX_BYTES) throw new Bad('too-large');
  if (b.length < 48 || tag(b, 0) !== 'wOF2') throw new Bad('not-woff2');
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const flavor = tag(b, 4);
  if (flavor === 'ttcf') throw new Bad('collection');
  if (flavor !== '\x00\x01\x00\x00' && flavor !== 'OTTO' && flavor !== 'true') {
    throw new Bad('not-woff2');
  }
  // The header's length must be this file: nothing hidden after the font.
  if (view.getUint32(8) !== b.length) throw new Bad('malformed');
  const numTables = view.getUint16(12);
  if (numTables < 1 || numTables > 64 || view.getUint16(14) !== 0) throw new Bad('malformed');
  const totalSfntSize = view.getUint32(16);
  const compressedSize = view.getUint32(20);
  if (totalSfntSize > MAX_SFNT_BYTES || compressedSize === 0) throw new Bad('malformed');
  const metaOffset = view.getUint32(28);
  const privOffset = view.getUint32(40);

  const tables: Table[] = [];
  let at = 48;
  let offset = 0;
  for (let i = 0; i < numTables; i++) {
    const flags = b[at++];
    if (flags === undefined) throw new Bad('malformed');
    let name: string;
    if ((flags & 0x3f) === 0x3f) {
      if (at + 4 > b.length) throw new Bad('malformed');
      name = tag(b, at);
      at += 4;
    } else {
      name = KNOWN_TAGS[flags & 0x3f] ?? '';
      if (!name) throw new Bad('malformed');
    }
    const version = flags >> 6;
    let length: number;
    [length, at] = base128(b, at);
    // glyf and loca are transformed unless their version is 3; other tables only when non-zero.
    const transformed = name === 'glyf' || name === 'loca' ? version !== 3 : version !== 0;
    if (transformed) {
      let transformLength: number;
      [transformLength, at] = base128(b, at);
      length = transformLength;
    }
    if (tables.some((t) => t.tag === name)) throw new Bad('malformed');
    tables.push({ tag: name, offset, length, transformed });
    offset += length;
  }
  // The compressed font data follows the directory and fits inside the file.
  const dataEnd = at + compressedSize;
  if (dataEnd > b.length) throw new Bad('malformed');
  for (const extra of [metaOffset, privOffset]) {
    if (extra !== 0 && extra < dataEnd) throw new Bad('malformed');
  }

  const has = (name: string) => tables.some((t) => t.tag === name);
  if (!REQUIRED.every(has) || !((has('glyf') && has('loca')) || has('CFF ') || has('CFF2'))) {
    throw new Bad('missing-tables');
  }

  const data = new Uint8Array(
    brotliDecompressSync(b.subarray(at, dataEnd), { maxOutputLength: MAX_SFNT_BYTES }),
  );
  // The stream must unpack to exactly the tables the directory lists.
  if (data.length !== offset) throw new Bad('malformed');
  const table = (name: string) => {
    const t = tables.find((x) => x.tag === name)!;
    return new DataView(data.buffer, data.byteOffset + t.offset, t.length);
  };

  const head = table('head');
  if (head.byteLength < 54 || head.getUint32(12) !== 0x5f0f3cf5) throw new Bad('malformed');
  const os2 = table('OS/2');
  if (os2.byteLength < 64) throw new Bad('malformed');
  const weightClass = os2.getUint16(4);
  const weight = Math.min(900, Math.max(100, Math.round(weightClass / 100) * 100));
  const italic = (os2.getUint16(62) & 0x01) !== 0;

  const family = familyName(table('name'));
  const chars = characters(table('cmap'));
  const scripts = (['latin', 'arabic'] as const).filter((script) =>
    LETTERS[script].every((ch) => chars(ch.codePointAt(0)!)),
  );
  if (scripts.length === 0) throw new Bad('no-letters');
  return { family, weight, italic, scripts };
}

/** The typographic family (name ID 16), else the family (ID 1), in a Windows Unicode record. */
function familyName(name: DataView): string {
  const count = name.getUint16(2);
  const strings = name.getUint16(4);
  const found = new Map<number, string>();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const platform = name.getUint16(r);
    const encoding = name.getUint16(r + 2);
    const nameId = name.getUint16(r + 6);
    if (platform !== 3 || (encoding !== 1 && encoding !== 10)) continue;
    if (nameId !== 1 && nameId !== 16) continue;
    const length = name.getUint16(r + 8);
    const start = strings + name.getUint16(r + 10);
    if (start + length > name.byteLength) throw new Bad('malformed');
    let text = '';
    for (let j = 0; j + 1 < length; j += 2) text += String.fromCharCode(name.getUint16(start + j));
    if (!found.has(nameId)) found.set(nameId, text);
  }
  return (found.get(16) ?? found.get(1) ?? '').trim();
}

/** A lookup of the characters a font maps, from its Unicode cmap (format 4 or 12). */
function characters(cmap: DataView): (code: number) => boolean {
  const count = cmap.getUint16(2);
  let best: { offset: number; format: number } | null = null;
  for (let i = 0; i < count; i++) {
    const r = 4 + i * 8;
    const platform = cmap.getUint16(r);
    const encoding = cmap.getUint16(r + 2);
    const offset = cmap.getUint32(r + 4);
    if (offset + 2 > cmap.byteLength) throw new Bad('malformed');
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    const format = cmap.getUint16(offset);
    if (unicode && (format === 12 || (format === 4 && best?.format !== 12))) {
      best = { offset, format };
    }
  }
  if (!best) return () => false;
  const o = best.offset;
  if (best.format === 12) {
    const groups = cmap.getUint32(o + 12);
    if (o + 16 + groups * 12 > cmap.byteLength) throw new Bad('malformed');
    return (code) => {
      for (let g = 0; g < groups; g++) {
        const r = o + 16 + g * 12;
        if (code >= cmap.getUint32(r) && code <= cmap.getUint32(r + 4)) {
          return cmap.getUint32(r + 8) + (code - cmap.getUint32(r)) !== 0;
        }
      }
      return false;
    };
  }
  const segments = cmap.getUint16(o + 6) / 2;
  const ends = o + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  if (rangeOffsets + segments * 2 > cmap.byteLength) throw new Bad('malformed');
  return (code) => {
    if (code > 0xffff) return false;
    for (let s = 0; s < segments; s++) {
      if (code > cmap.getUint16(ends + s * 2)) continue;
      const start = cmap.getUint16(starts + s * 2);
      if (code < start) return false;
      const rangeOffset = cmap.getUint16(rangeOffsets + s * 2);
      if (rangeOffset === 0) return ((code + cmap.getInt16(deltas + s * 2)) & 0xffff) !== 0;
      const glyphAt = rangeOffsets + s * 2 + rangeOffset + (code - start) * 2;
      if (glyphAt + 2 > cmap.byteLength) return false;
      return cmap.getUint16(glyphAt) !== 0;
    }
    return false;
  };
}
