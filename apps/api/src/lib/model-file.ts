/**
 * A first, honest check on an uploaded CAD or model file (D-029): only what can actually be
 * verified from the bytes themselves, by format. This is a sanity check, not the real gate —
 * the authoritative check is the processing runner actually reading the file (glTF-Transform,
 * or in a later stage a CAD kernel); a file that passes here can still fail there, and the job
 * is marked `failed` rather than ever producing a result from a file that didn't really parse.
 */

export const MAX_MODEL_BYTES = 150 * 1024 * 1024;
export const MAX_CAD_BYTES = 50 * 1024 * 1024;
/** A full-resolution capture photo, encoded as WebP on the device like the media library (D-044). */
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export type ModelFormat = 'glb' | 'gltf' | 'obj' | 'usdz' | 'fbx';
export type CadFormat = 'step' | 'iges';

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/** GLB: the one format here with a magic number and a length field that can be checked exactly. */
function looksLikeGlb(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (ascii(bytes, 0, 4) !== 'glTF') return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(8, true) === bytes.length;
}

/** glTF (JSON): valid JSON with the one field every version of the format requires. */
function looksLikeGltfJson(bytes: Uint8Array): boolean {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { asset?: unknown }).asset === 'object'
    );
  } catch {
    return false;
  }
}

/** USDZ: a zip archive (its local file header signature); the contents aren't opened here. */
function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && ascii(bytes, 0, 4) === 'PK\x03\x04';
}

/** OBJ: plain text with at least one vertex or face line; never binary. */
function looksLikeObjText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
  return /^\s*(v|f|vn|vt)\s/m.test(text);
}

/** FBX: the binary signature if present; otherwise text, which an ASCII FBX file always is. */
function looksLikeFbx(bytes: Uint8Array): boolean {
  if (ascii(bytes, 0, 20) === 'Kaydara FBX Binary ') return true;
  return !bytes.subarray(0, 65536).includes(0);
}

export function checkModelFile(
  bytes: Uint8Array,
  format: ModelFormat,
): { ok: true } | { ok: false; reason: 'too-large' | 'empty' | 'invalid-file' } {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_MODEL_BYTES) return { ok: false, reason: 'too-large' };
  const valid = {
    glb: looksLikeGlb,
    gltf: looksLikeGltfJson,
    usdz: looksLikeZip,
    obj: looksLikeObjText,
    fbx: looksLikeFbx,
  }[format](bytes);
  return valid ? { ok: true } : { ok: false, reason: 'invalid-file' };
}

/** STEP has a reliable text header; IGES is checked only for being plausible text (see above). */
function looksLikeStep(bytes: Uint8Array): boolean {
  const text = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
  return text.toUpperCase().startsWith('ISO-10303-21;');
}
function looksLikeIges(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  const text = new TextDecoder().decode(bytes.subarray(0, 160));
  // Every IGES record ends its 80-column line with a section letter in column 73 (index 72).
  const lines = text.split(/\r?\n/);
  return lines.length > 0 && /^[SGDP]$/.test(lines[0]?.[72] ?? '');
}

export function checkCadFile(
  bytes: Uint8Array,
  format: CadFormat,
): { ok: true } | { ok: false; reason: 'too-large' | 'empty' | 'invalid-file' } {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_CAD_BYTES) return { ok: false, reason: 'too-large' };
  const valid = format === 'step' ? looksLikeStep(bytes) : looksLikeIges(bytes);
  return valid ? { ok: true } : { ok: false, reason: 'invalid-file' };
}
