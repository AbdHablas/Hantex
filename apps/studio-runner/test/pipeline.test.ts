import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsVariants } from '@gltf-transform/extensions';
import { DESKTOP_BUDGET, MOBILE_BUDGET, technicalGate } from '@hantex/studio';
import { describe, expect, it } from 'vitest';
import { runPipeline, UnsupportedFormatError } from '../src/pipeline';
import { isWebp, makeBoxGlb, makeBoxGltf, makeDenseTexturedGlb } from './fixture';

/**
 * The real pipeline on real GLB files: glTF-Transform, meshoptimizer, sharp, the Khronos
 * validator and a headless Chromium render — nothing mocked.
 */
describe('runPipeline', () => {
  it('turns a GLB into validated desktop and mobile models, with two rendered posters', async () => {
    const output = await runPipeline({
      bytes: await makeBoxGlb(),
      format: 'glb',
      finishIds: ['black00001', 'white00001'],
      dimensionsMm: { width: 1000, height: 1000, depth: 500 },
    });

    expect(output.validatorReport.desktop.numErrors).toBe(0);
    expect(output.validatorReport.mobile.numErrors).toBe(0);
    expect(output.measurements.desktop.triangles).toBe(12);
    expect(output.measurements.boundingBoxMm).toEqual({ width: 1000, height: 1000, depth: 500 });
    expect(output.withinScale).toBe(true);
    expect(technicalGate({ label: 'artist-modelled', ...output })).toEqual([]);

    // Both versions carry one material variant per finish, named by the finish's id.
    for (const version of [output.desktop, output.mobile]) {
      const doc = await new NodeIO().registerExtensions([KHRMaterialsVariants]).readBinary(version);
      const variants = doc
        .getRoot()
        .listExtensionsUsed()
        .find((ext): ext is KHRMaterialsVariants => ext instanceof KHRMaterialsVariants);
      expect(variants?.listVariants().map((v) => v.getName())).toEqual([
        'black00001',
        'white00001',
      ]);
    }

    expect(isWebp(output.posterFront)).toBe(true);
    expect(isWebp(output.posterThreeQuarter)).toBe(true);
  }, 60_000);

  it('simplifies and resizes a model over budget until each version fits', async () => {
    const output = await runPipeline({
      bytes: await makeDenseTexturedGlb(),
      format: 'glb',
      finishIds: [],
      dimensionsMm: { width: 100, height: 100, depth: 100 },
    });

    const { desktop, mobile } = output.measurements;
    expect(desktop.triangles).toBeLessThanOrEqual(DESKTOP_BUDGET.maxTriangles);
    expect(desktop.triangles).toBeGreaterThan(DESKTOP_BUDGET.maxTriangles * 0.8);
    expect(mobile.triangles).toBeLessThanOrEqual(MOBILE_BUDGET.maxTriangles);
    expect(desktop.maxTextureSize).toBe(2048);
    expect(mobile.maxTextureSize).toBe(1024);
    expect(desktop.bytes).toBeLessThanOrEqual(DESKTOP_BUDGET.maxBytes);
    expect(mobile.bytes).toBeLessThanOrEqual(MOBILE_BUDGET.maxBytes);
    expect(output.validatorReport.desktop.numErrors).toBe(0);
    expect(output.withinScale).toBe(true);
    expect(technicalGate({ label: 'measured', ...output })).toEqual([]);
  }, 120_000);

  it('measures true size including node transforms, as exporters in centimetres write it', async () => {
    const output = await runPipeline({
      bytes: await makeBoxGlb({ centimetres: true }),
      format: 'glb',
      finishIds: [],
      dimensionsMm: { width: 1000, height: 1000, depth: 500 },
    });
    expect(output.measurements.boundingBoxMm?.width).toBeCloseTo(1000, 3);
    expect(output.withinScale).toBe(true);
  }, 60_000);

  it('fails the scale check when the entered dimensions do not match', async () => {
    const output = await runPipeline({
      bytes: await makeBoxGlb(),
      format: 'glb',
      finishIds: [],
      dimensionsMm: { width: 2000, height: 1000, depth: 500 },
    });
    expect(output.withinScale).toBe(false);
    expect(technicalGate({ label: 'artist-modelled', ...output })).toEqual([
      { check: 'scale', reason: 'mismatch' },
    ]);
  }, 60_000);

  it('cannot check scale without dimensions, and the gate says so', async () => {
    const output = await runPipeline({
      bytes: await makeBoxGlb(),
      format: 'glb',
      finishIds: [],
      dimensionsMm: null,
    });
    expect(output.withinScale).toBeNull();
    expect(technicalGate({ label: 'measured', ...output })).toEqual([
      { check: 'scale', reason: 'no-dimensions' },
    ]);
  }, 60_000);

  it('reports a primitive without a material', async () => {
    const output = await runPipeline({
      bytes: await makeBoxGlb({ material: false }),
      format: 'glb',
      finishIds: ['black00001'],
      dimensionsMm: { width: 1000, height: 1000, depth: 500 },
    });
    expect(output.measurements.primitivesWithoutMaterial).toBe(1);
    expect(technicalGate({ label: 'artist-modelled', ...output })).toEqual([
      { check: 'materials', missing: 1 },
    ]);
  }, 60_000);

  it('reads a self-contained glTF (JSON) file, and explains one that needs separate files', async () => {
    const output = await runPipeline({
      bytes: await makeBoxGltf({ embedded: true }),
      format: 'gltf',
      finishIds: [],
      dimensionsMm: { width: 1000, height: 1000, depth: 500 },
    });
    expect(output.validatorReport.desktop.numErrors).toBe(0);
    expect(output.withinScale).toBe(true);

    await expect(
      runPipeline({
        bytes: await makeBoxGltf({ embedded: false }),
        format: 'gltf',
        finishIds: [],
        dimensionsMm: null,
      }),
    ).rejects.toThrow(/refers to separate files/);
  }, 60_000);

  it('refuses a format it cannot read yet, rather than guessing', async () => {
    await expect(
      runPipeline({
        bytes: await makeBoxGlb(),
        format: 'obj',
        finishIds: [],
        dimensionsMm: null,
      }),
    ).rejects.toThrow(UnsupportedFormatError);
  });
});
