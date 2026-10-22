/** Test files for the media library. */

/** A minimal lossless WebP header for the given size (enough for the header check). */
export function fakeWebp(width: number, height: number, padding = 16): ArrayBuffer {
  const length = 21 + 4 + padding;
  const b = new Uint8Array(length);
  const view = new DataView(b.buffer);
  b.set(
    [...'RIFF'].map((c) => c.charCodeAt(0)),
    0,
  );
  view.setUint32(4, length - 8, true);
  b.set(
    [...'WEBPVP8L'].map((c) => c.charCodeAt(0)),
    8,
  );
  view.setUint32(16, length - 20, true);
  b[20] = 0x2f;
  view.setUint32(21, ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), true);
  return b.buffer;
}
