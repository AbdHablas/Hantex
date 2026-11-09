import { describe, expect, it } from 'vitest';
import { technicalGate, type ModelResult } from './technical-gate';

const passing: ModelResult = {
  label: 'artist-modelled',
  measurements: {
    desktop: { bytes: 1_500_000, triangles: 90_000, maxTextureSize: 2048 },
    mobile: { bytes: 800_000, triangles: 45_000, maxTextureSize: 1024 },
    boundingBoxMm: { width: 86, height: 86, depth: 12 },
    primitivesWithoutMaterial: 0,
  },
  validatorReport: {
    desktop: { numErrors: 0, numWarnings: 1, messages: ['warning: example'] },
    mobile: { numErrors: 0, numWarnings: 0, messages: [] },
  },
  withinScale: true,
};

describe('technicalGate', () => {
  it('passes a valid model within budget and at true scale', () => {
    expect(technicalGate(passing)).toEqual([]);
  });

  it('reports validator errors on either version, but not warnings', () => {
    const issues = technicalGate({
      ...passing,
      validatorReport: {
        desktop: { numErrors: 0, numWarnings: 3, messages: [] },
        mobile: { numErrors: 2, numWarnings: 0, messages: [] },
      },
    });
    expect(issues).toEqual([{ check: 'validator', version: 'mobile', errors: 2 }]);
  });

  it('reports each budget a version misses', () => {
    const issues = technicalGate({
      ...passing,
      measurements: {
        ...(passing.measurements as object),
        mobile: { bytes: 800_000, triangles: 60_000, maxTextureSize: 2048 },
      },
    });
    expect(issues.map((i) => (i.check === 'budget' ? i.budget.check : i.check)).sort()).toEqual([
      'texture-size',
      'triangles',
    ]);
  });

  it('requires the scale check for labels that promise true scale', () => {
    expect(technicalGate({ ...passing, withinScale: false })).toEqual([
      { check: 'scale', reason: 'mismatch' },
    ]);
    expect(technicalGate({ ...passing, label: 'measured', withinScale: null })).toEqual([
      { check: 'scale', reason: 'no-dimensions' },
    ]);
  });

  it('does not require it for a captured view or an AI estimate, which never claim true scale', () => {
    expect(technicalGate({ ...passing, label: 'captured-view', withinScale: null })).toEqual([]);
    expect(technicalGate({ ...passing, label: 'ai-estimated', withinScale: false })).toEqual([]);
  });

  it('reports primitives without a material', () => {
    const issues = technicalGate({
      ...passing,
      measurements: { ...(passing.measurements as object), primitivesWithoutMaterial: 2 },
    });
    expect(issues).toEqual([{ check: 'materials', missing: 2 }]);
  });

  it('never passes a result it cannot read', () => {
    expect(technicalGate({ ...passing, measurements: {} })).toEqual([{ check: 'unreadable' }]);
    expect(technicalGate({ ...passing, validatorReport: null })).toEqual([{ check: 'unreadable' }]);
  });
});
