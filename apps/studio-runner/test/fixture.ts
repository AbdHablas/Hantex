import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

/**
 * Real GLB files for the pipeline's tests, built with glTF-Transform itself. glTF units are
 * metres, so the box is 1 × 1 × 0.5 m = 1000 × 1000 × 500 mm.
 */
export async function makeBoxGlb(
  options: { centimetres?: boolean; material?: boolean } = {},
): Promise<Uint8Array> {
  const unit = options.centimetres ? 100 : 1;
  const doc = new Document();
  const buffer = doc.createBuffer();
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 0.5],
    [1, 0, 0.5],
    [1, 1, 0.5],
    [0, 1, 0.5],
  ];
  const positions = new Float32Array(corners.flat().map((v) => v * unit));
  // The 12 triangles of the box's six faces.
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2,
    6, 1, 6, 5,
  ]);
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer),
    )
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer));
  if (options.material !== false) {
    prim.setMaterial(doc.createMaterial('white').setBaseColorFactor([1, 1, 1, 1]));
  }
  // An exporter working in centimetres scales the node by 0.01 instead of the vertices.
  const node = doc.createNode('box').setMesh(doc.createMesh('box').addPrimitive(prim));
  if (options.centimetres) node.setScale([0.01, 0.01, 0.01]);
  doc.getRoot().setDefaultScene(doc.createScene().addChild(node));
  return new NodeIO().writeBinary(doc);
}

/**
 * A 100 mm sphere with 204,800 triangles and a 4096 × 4096 texture: over both website budgets
 * on triangles and texture size, like a full-detail photogrammetry export.
 */
export async function makeDenseTexturedGlb(): Promise<Uint8Array> {
  const segments = 320;
  const radius = 0.05;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI;
    for (let j = 0; j <= segments; j++) {
      const phi = (j / segments) * 2 * Math.PI;
      positions.push(
        radius * Math.sin(theta) * Math.cos(phi),
        radius * Math.cos(theta),
        radius * Math.sin(theta) * Math.sin(phi),
      );
      uvs.push(j / segments, i / segments);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const png = await sharp({
    create: { width: 4096, height: 4096, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
  const doc = new Document();
  const buffer = doc.createBuffer();
  const texture = doc.createTexture('base').setImage(new Uint8Array(png)).setMimeType('image/png');
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setAttribute(
      'TEXCOORD_0',
      doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer),
    )
    .setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer),
    )
    .setMaterial(doc.createMaterial('surface').setBaseColorTexture(texture));
  const node = doc.createNode('sphere').setMesh(doc.createMesh('sphere').addPrimitive(prim));
  doc.getRoot().setDefaultScene(doc.createScene().addChild(node));
  return new NodeIO().writeBinary(doc);
}

/** A WebP file starts with "RIFF", four length bytes, then "WEBP". */
export function isWebp(bytes: Uint8Array): boolean {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  return text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
}
