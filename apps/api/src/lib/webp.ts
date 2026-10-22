/**
 * Reads a WebP file's header: is it really a single-frame WebP, and how large is it? The
 * dashboard encodes every image as WebP (D-044); the server trusts nothing it was told and
 * checks the bytes themselves. Pixels are never decoded here.
 */
export interface WebpInfo {
  width: number;
  height: number;
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

export function readWebp(buffer: ArrayBuffer): WebpInfo | null {
  const b = new Uint8Array(buffer);
  if (b.length < 30) return null;
  if (ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const view = new DataView(buffer);
  // The RIFF size must describe exactly this file: nothing hidden after the image.
  if (view.getUint32(4, true) + 8 !== b.length) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ') {
    // Lossy: a key frame's start code, then 14-bit width and height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    // Lossless: a signature byte, then width-1 and height-1 in 14 bits each.
    if (b[20] !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    // Extended: no animation; canvas size as 24-bit values minus one.
    if ((b[20]! & 0x02) !== 0) return null;
    const width = (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1;
    const height = (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1;
    return { width, height };
  }
  return null;
}
