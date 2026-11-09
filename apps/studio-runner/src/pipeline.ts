import { getBounds, NodeIO, type Document } from '@gltf-transform/core';
import { KHRMaterialsVariants } from '@gltf-transform/extensions';
import { compressTexture, simplify, weld } from '@gltf-transform/functions';
import {
  DESKTOP_BUDGET,
  MOBILE_BUDGET,
  withinScaleTolerance,
  type ModelBudget,
  type ModelMeasurementsResult,
  type Size3,
  type ValidatorReportResult,
} from '@hantex/studio';
import { validateBytes } from 'gltf-validator';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { renderPosters } from './poster';

/**
 * The processing pipeline (D-029 §6): the same steps for every model, whichever provider made
 * the raw file. Stage 1 reads GLB and glTF; OBJ, USDZ and FBX are accepted as uploads but not
 * converted yet, so a job for one fails with that reason rather than skipping a step.
 *
 * Each website version (desktop, mobile) is built from its own fresh read of the upload:
 * welded, simplified down to its triangle budget, textures resized to its texture budget,
 * then checked by the Khronos glTF validator. Whatever still misses a budget is reported, not
 * hidden — the technical gate (`@hantex/studio`) then keeps the model from approval.
 */

export interface PipelineInput {
  bytes: Uint8Array;
  format: 'glb' | 'gltf' | 'obj' | 'usdz' | 'fbx';
  /** Catalogue finish ids, one material variant each. */
  finishIds: string[];
  dimensionsMm: Size3 | null;
}

export interface PipelineOutput {
  desktop: Uint8Array;
  mobile: Uint8Array;
  posterFront: Uint8Array;
  posterThreeQuarter: Uint8Array;
  measurements: ModelMeasurementsResult;
  validatorReport: ValidatorReportResult;
  withinScale: boolean | null;
}

export class UnsupportedFormatError extends Error {
  constructor(format: string) {
    super(`The format "${format}" isn't converted yet; export the model as GLB.`);
  }
}

/**
 * The most a simplified surface may move, as a fraction of the model's radius: about 0.05 mm
 * on an 86 mm switch plate, well below the buttons, openings and markings a reviewer checks.
 * A mesh that can't reach its budget within this stays over budget and is reported.
 */
const MAX_SIMPLIFY_ERROR = 0.001;
/** Aim a little under the triangle budget: the simplifier can land slightly above its target. */
const TRIANGLE_HEADROOM = 0.95;

const io = () => new NodeIO().registerExtensions([KHRMaterialsVariants]);

async function readDocument(input: PipelineInput): Promise<Document> {
  if (input.format !== 'glb' && input.format !== 'gltf') {
    throw new UnsupportedFormatError(input.format);
  }
  return io().readBinary(input.bytes);
}

/**
 * Every finish becomes a `KHR_materials_variants` variant named by its catalogue finish id, so
 * the website's viewer can switch finish without downloading another model, and a renamed
 * finish still matches. Stage 1 gets only the ids, not per-finish material values (colour,
 * gloss), so every variant maps to the primitive's one material until those values are set.
 */
function addFinishVariants(doc: Document, finishIds: string[]): void {
  if (finishIds.length === 0) return;
  const ext = doc.createExtension(KHRMaterialsVariants);
  const variants = finishIds.map((id) => ext.createVariant(id));
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      if (!material) continue;
      const mapping = ext.createMapping().setMaterial(material);
      for (const variant of variants) mapping.addVariant(variant);
      prim.setExtension('KHR_materials_variants', ext.createMappingList().addMapping(mapping));
    }
  }
}

const primitives = (doc: Document) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());

function countTriangles(doc: Document): number {
  let triangles = 0;
  for (const prim of primitives(doc)) {
    const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
    triangles += count / 3;
  }
  return Math.round(triangles);
}

function maxTextureSize(doc: Document): number {
  let max = 0;
  for (const texture of doc.getRoot().listTextures()) {
    const size = texture.getSize();
    if (size) max = Math.max(max, size[0], size[1]);
  }
  return max;
}

/**
 * The model's world-space size in mm, node transforms included (an exporter may model in
 * centimetres and scale the node by 0.01). glTF is metres, Y up, front facing +Z, so width is
 * X, height Y and depth Z. Null if the scene has no geometry.
 */
function boundingBoxMm(doc: Document): Size3 | null {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene || primitives(doc).length === 0) return null;
  const { min, max } = getBounds(scene);
  if (![...min, ...max].every(Number.isFinite)) return null;
  return {
    width: (max[0] - min[0]) * 1000,
    height: (max[1] - min[1]) * 1000,
    depth: (max[2] - min[2]) * 1000,
  };
}

/** One website version, built from its own fresh read of the upload. */
async function buildVersion(input: PipelineInput, budget: ModelBudget) {
  const doc = await readDocument(input);
  addFinishVariants(doc, input.finishIds);
  await doc.transform(weld());
  const triangles = countTriangles(doc);
  if (triangles > budget.maxTriangles) {
    const ratio = (budget.maxTriangles / triangles) * TRIANGLE_HEADROOM;
    await doc.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio, error: MAX_SIMPLIFY_ERROR }),
    );
  }
  // Only textures over budget are re-encoded (resizing is lossy anyway); each keeps its own
  // format (PNG or JPEG), which every viewer and AR app reads. Sharp's input-pixel limit stays
  // on, so a decompression-bomb image fails the job instead of exhausting memory.
  for (const texture of doc.getRoot().listTextures()) {
    const size = texture.getSize();
    if (size && Math.max(size[0], size[1]) > budget.maxTextureSize) {
      await compressTexture(texture, {
        encoder: sharp,
        resize: [budget.maxTextureSize, budget.maxTextureSize],
      });
    }
  }
  const bytes = await io().writeBinary(doc);
  const report = await validateBytes(bytes);
  return {
    bytes,
    measured: {
      bytes: bytes.byteLength,
      triangles: countTriangles(doc),
      maxTextureSize: maxTextureSize(doc),
    },
    report: {
      numErrors: report.issues.numErrors,
      numWarnings: report.issues.numWarnings,
      messages: report.issues.messages
        .slice(0, 50)
        .map((m) => `${SEVERITY[m.severity]}: ${m.code}: ${m.message}`),
    },
  };
}

const SEVERITY = ['error', 'warning', 'info', 'hint'] as const;

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  // Measured on the upload itself, before simplification, which shouldn't move the outline.
  const source = await readDocument(input);
  const measuredMm = boundingBoxMm(source);
  const primitivesWithoutMaterial = primitives(source).filter((p) => !p.getMaterial()).length;

  const desktop = await buildVersion(input, DESKTOP_BUDGET);
  const mobile = await buildVersion(input, MOBILE_BUDGET);
  const posters = await renderPosters(desktop.bytes);

  return {
    desktop: desktop.bytes,
    mobile: mobile.bytes,
    posterFront: posters.front,
    posterThreeQuarter: posters.threeQuarter,
    measurements: {
      desktop: desktop.measured,
      mobile: mobile.measured,
      boundingBoxMm: measuredMm,
      primitivesWithoutMaterial,
    },
    validatorReport: { desktop: desktop.report, mobile: mobile.report },
    withinScale:
      input.dimensionsMm && measuredMm
        ? withinScaleTolerance(measuredMm, input.dimensionsMm)
        : null,
  };
}
