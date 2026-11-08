import { describe, expect, it } from 'vitest';
import {
  checkCadFile,
  checkModelFile,
  MAX_CAD_BYTES,
  MAX_MODEL_BYTES,
} from '../src/lib/model-file';

/** A minimal GLB header: magic, version, and a total length that matches the buffer. */
function glbHeader(totalLength: number): Uint8Array {
  const bytes = new Uint8Array(totalLength);
  bytes.set([0x67, 0x6c, 0x54, 0x46], 0); // "glTF"
  new DataView(bytes.buffer).setUint32(4, 2, true); // version 2
  new DataView(bytes.buffer).setUint32(8, totalLength, true);
  return bytes;
}

const text = (s: string) => new TextEncoder().encode(s);

describe('checkModelFile', () => {
  it('accepts a GLB whose declared length matches the file, and rejects a mismatch', () => {
    expect(checkModelFile(glbHeader(32), 'glb')).toEqual({ ok: true });
    const tampered = glbHeader(32);
    new DataView(tampered.buffer).setUint32(8, 999, true);
    expect(checkModelFile(tampered, 'glb')).toEqual({ ok: false, reason: 'invalid-file' });
  });

  it('refuses a GLB header on a file declared as something else', () => {
    expect(checkModelFile(glbHeader(32), 'obj')).toEqual({ ok: false, reason: 'invalid-file' });
  });

  it('accepts valid glTF JSON and refuses JSON missing the required asset field', () => {
    expect(checkModelFile(text('{"asset":{"version":"2.0"}}'), 'gltf')).toEqual({ ok: true });
    expect(checkModelFile(text('{"foo":1}'), 'gltf')).toEqual({
      ok: false,
      reason: 'invalid-file',
    });
    expect(checkModelFile(text('not json'), 'gltf')).toEqual({
      ok: false,
      reason: 'invalid-file',
    });
  });

  it('accepts a zip signature as USDZ and refuses plain text', () => {
    expect(checkModelFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]), 'usdz')).toEqual({
      ok: true,
    });
    expect(checkModelFile(text('not a zip'), 'usdz')).toEqual({
      ok: false,
      reason: 'invalid-file',
    });
  });

  it('accepts OBJ text with a vertex line, and refuses binary data or text with none', () => {
    expect(checkModelFile(text('v 0 0 0\nf 1 2 3\n'), 'obj')).toEqual({ ok: true });
    expect(checkModelFile(text('hello world'), 'obj')).toEqual({
      ok: false,
      reason: 'invalid-file',
    });
    expect(checkModelFile(new Uint8Array([1, 0, 2, 0, 3]), 'obj')).toEqual({
      ok: false,
      reason: 'invalid-file',
    });
  });

  it('refuses an empty file and one over the size limit', () => {
    expect(checkModelFile(new Uint8Array(0), 'glb')).toEqual({ ok: false, reason: 'empty' });
    expect(checkModelFile(new Uint8Array(MAX_MODEL_BYTES + 1), 'obj')).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });
});

describe('checkCadFile', () => {
  it('accepts a STEP file by its header, case-insensitively', () => {
    expect(checkCadFile(text('ISO-10303-21;\nHEADER;\nENDSEC;\n'), 'step')).toEqual({ ok: true });
    expect(checkCadFile(text('iso-10303-21;'), 'step')).toEqual({ ok: true });
    expect(checkCadFile(text('not a step file'), 'step')).toEqual({
      ok: false,
      reason: 'invalid-file',
    });
  });

  it('refuses an oversized or empty CAD upload', () => {
    expect(checkCadFile(new Uint8Array(0), 'step')).toEqual({ ok: false, reason: 'empty' });
    expect(checkCadFile(new Uint8Array(MAX_CAD_BYTES + 1), 'step')).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });
});
