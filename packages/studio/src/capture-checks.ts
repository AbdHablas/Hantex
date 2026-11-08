import type { CaptureSummary, CaptureView, Eligibility, Method, PhotoMeta } from './types';

/**
 * Capture checks (D-029, §5.4 of the design doc): whether what was uploaded is honestly enough
 * for a given method. These are pure checks on measured facts (pixel dimensions, counts, which
 * views are present); nothing here looks at a file's name or a form field someone typed.
 */

/** At least this many pixels on the long side, so close-up details are usable (§5.4). */
export const MIN_LONG_SIDE_PX = 2000;

/** Apple's documented floor for photogrammetry to have a chance of succeeding at all. */
export const MIN_PHOTOGRAMMETRY_PHOTOS = 20;

/** The Studio's own target for a full capture (three rings plus the underside, §5.4). */
export const FULL_CAPTURE_TARGET_PHOTOS = 100;

/** The views a quick capture should have, for an AI-estimated draft or an artist brief. */
export const QUICK_CAPTURE_VIEWS: readonly CaptureView[] = [
  'front',
  'left',
  'right',
  'rear',
  'top',
];

export interface PhotoIssue {
  view: CaptureView;
  code: 'too-small' | 'blurry';
}

/** A photo too small to use at all, or soft enough to flag for a sharper retake. */
export function checkPhoto(photo: PhotoMeta): PhotoIssue[] {
  const issues: PhotoIssue[] = [];
  if (Math.max(photo.widthPx, photo.heightPx) < MIN_LONG_SIDE_PX) {
    issues.push({ view: photo.view, code: 'too-small' });
  }
  // A low score only ever comes from a measurement the caller made; absent, nothing is assumed.
  if (photo.sharpness !== undefined && photo.sharpness < 0.15) {
    issues.push({ view: photo.view, code: 'blurry' });
  }
  return issues;
}

/** Every usable-size photo's issues, in the order given. */
export function checkCapture(summary: CaptureSummary): PhotoIssue[] {
  return summary.photos.flatMap(checkPhoto);
}

/** The quick-capture views that are missing (ignoring photos too small to count). */
export function missingQuickViews(summary: CaptureSummary): CaptureView[] {
  const usable = new Set(
    summary.photos
      .filter((p) => checkPhoto(p).every((i) => i.code !== 'too-small'))
      .map((p) => p.view),
  );
  return QUICK_CAPTURE_VIEWS.filter((v) => !usable.has(v));
}

/**
 * What a capture honestly allows (D-029 §2, §6): CAD and a finished model are taken as given
 * (their own checks happen when the file is read); photographs are judged only on count and
 * resolution here — a full photogrammetry or splat attempt still depends on overlap and light
 * that no still check can see, so the processing job itself is the real test.
 */
export function eligibility(summary: CaptureSummary): Eligibility[] {
  const usablePhotos = summary.photos.filter((p) =>
    checkPhoto(p).every((i) => i.code !== 'too-small'),
  );
  const missingViews = missingQuickViews(summary);

  const results: Eligibility[] = [];
  const add = (method: Method, possible: boolean, reason?: string) =>
    results.push({ method, possible, ...(reason ? { reason } : {}) });

  add('cad', summary.hasCad, summary.hasCad ? undefined : 'no-cad-file');
  add('artist', missingViews.length === 0, missingViews.length === 0 ? undefined : 'missing-views');
  add(
    'generative',
    missingViews.length === 0,
    missingViews.length === 0 ? undefined : 'missing-views',
  );
  const enoughForMeasured = usablePhotos.length >= MIN_PHOTOGRAMMETRY_PHOTOS;
  add('photogrammetry', enoughForMeasured, enoughForMeasured ? undefined : 'not-enough-photos');
  add('splat', enoughForMeasured, enoughForMeasured ? undefined : 'not-enough-photos');
  // A finished model file (from a capture app or an artist) stands in for the method the
  // uploader declares it came from; it is accepted as that method once the file itself is read.
  if (summary.hasModel) {
    for (const r of results) {
      if (
        (r.method === 'photogrammetry' || r.method === 'splat' || r.method === 'artist') &&
        !r.possible
      ) {
        r.possible = true;
        delete r.reason;
      }
    }
  }
  return results;
}

/**
 * Whether a model may be shown at true scale ("view on your wall", D-029 §5.4, §6): real
 * dimensions must be entered, and the website only ever does this once the processed model's
 * own measured bounding box has been checked against them (that check runs in the pipeline,
 * not here, since it needs the finished model).
 */
export const canCheckTrueScale = (summary: CaptureSummary) => summary.dimensionsMm !== null;
