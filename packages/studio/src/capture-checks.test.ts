import { describe, expect, it } from 'vitest';
import {
  canCheckTrueScale,
  checkCapture,
  checkPhoto,
  eligibility,
  missingQuickViews,
} from './capture-checks';
import type { CaptureSummary, PhotoMeta } from './types';

const photo = (view: PhotoMeta['view'], overrides: Partial<PhotoMeta> = {}): PhotoMeta => ({
  view,
  widthPx: 3000,
  heightPx: 2000,
  ...overrides,
});

const empty: CaptureSummary = {
  photos: [],
  hasCad: false,
  hasModel: false,
  dimensionsMm: null,
};

describe('checkPhoto', () => {
  it('flags a photo too small on both sides', () => {
    expect(checkPhoto(photo('front', { widthPx: 800, heightPx: 600 }))).toEqual([
      { view: 'front', code: 'too-small' },
    ]);
  });

  it('accepts a photo at least 2000px on the long side, even if the other side is shorter', () => {
    expect(checkPhoto(photo('front', { widthPx: 2000, heightPx: 400 }))).toEqual([]);
  });

  it('flags a measured low sharpness score, but assumes nothing when none was measured', () => {
    expect(checkPhoto(photo('front', { sharpness: 0.05 }))).toEqual([
      { view: 'front', code: 'blurry' },
    ]);
    expect(checkPhoto(photo('front'))).toEqual([]);
  });
});

describe('checkCapture', () => {
  it('collects issues across every photo', () => {
    const summary: CaptureSummary = {
      ...empty,
      photos: [photo('front'), photo('rear', { widthPx: 500, heightPx: 500 })],
    };
    expect(checkCapture(summary)).toEqual([{ view: 'rear', code: 'too-small' }]);
  });
});

describe('missingQuickViews', () => {
  it('lists the quick-capture views that have no usable photo', () => {
    const summary: CaptureSummary = {
      ...empty,
      photos: [photo('front'), photo('left'), photo('rear', { widthPx: 100, heightPx: 100 })],
    };
    expect(missingQuickViews(summary).sort()).toEqual(['rear', 'right', 'top']);
  });

  it('is empty once front, left, right, rear and top all have a usable photo', () => {
    const summary: CaptureSummary = {
      ...empty,
      photos: ['front', 'left', 'right', 'rear', 'top'].map((v) => photo(v as PhotoMeta['view'])),
    };
    expect(missingQuickViews(summary)).toEqual([]);
  });
});

describe('eligibility', () => {
  it('says only CAD is possible for a CAD-only capture', () => {
    const summary: CaptureSummary = { ...empty, hasCad: true };
    const results = eligibility(summary);
    expect(results.find((r) => r.method === 'cad')).toEqual({ method: 'cad', possible: true });
    expect(results.find((r) => r.method === 'photogrammetry')?.possible).toBe(false);
    expect(results.find((r) => r.method === 'artist')?.possible).toBe(false);
  });

  it('allows an AI-estimated draft and an artist brief from a quick capture, never a measured model', () => {
    const summary: CaptureSummary = {
      ...empty,
      photos: ['front', 'left', 'right', 'rear', 'top'].map((v) => photo(v as PhotoMeta['view'])),
    };
    const results = eligibility(summary);
    expect(results.find((r) => r.method === 'generative')).toEqual({
      method: 'generative',
      possible: true,
    });
    expect(results.find((r) => r.method === 'artist')?.possible).toBe(true);
    const measured = results.find((r) => r.method === 'photogrammetry')!;
    expect(measured.possible).toBe(false);
    expect(measured.reason).toBe('not-enough-photos');
  });

  it('allows a measured model only once enough usable photos are uploaded', () => {
    const fewPhotos: CaptureSummary = {
      ...empty,
      photos: Array.from({ length: 19 }, () => photo('detail')),
    };
    expect(eligibility(fewPhotos).find((r) => r.method === 'photogrammetry')?.possible).toBe(false);

    const enoughPhotos: CaptureSummary = {
      ...empty,
      photos: Array.from({ length: 20 }, () => photo('detail')),
    };
    expect(eligibility(enoughPhotos).find((r) => r.method === 'photogrammetry')?.possible).toBe(
      true,
    );
  });

  it('a photo too small to use is never counted, even toward reaching 20', () => {
    const summary: CaptureSummary = {
      ...empty,
      photos: [
        ...Array.from({ length: 19 }, () => photo('detail')),
        photo('detail', { widthPx: 100, heightPx: 100 }),
      ],
    };
    expect(eligibility(summary).find((r) => r.method === 'photogrammetry')?.possible).toBe(false);
  });

  it('accepts an uploaded finished model as whichever method the uploader declares it is', () => {
    const summary: CaptureSummary = { ...empty, hasModel: true };
    const results = eligibility(summary);
    expect(results.find((r) => r.method === 'photogrammetry')?.possible).toBe(true);
    expect(results.find((r) => r.method === 'splat')?.possible).toBe(true);
    expect(results.find((r) => r.method === 'artist')?.possible).toBe(true);
    // A model file says nothing about CAD or generative eligibility.
    expect(results.find((r) => r.method === 'cad')?.possible).toBe(false);
  });
});

describe('canCheckTrueScale', () => {
  it('needs real dimensions entered', () => {
    expect(canCheckTrueScale(empty)).toBe(false);
    expect(canCheckTrueScale({ ...empty, dimensionsMm: { width: 1, height: 1, depth: 1 } })).toBe(
      true,
    );
  });
});
