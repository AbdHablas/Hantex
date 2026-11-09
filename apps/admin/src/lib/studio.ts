import type { CaptureView, Eligibility, Method, ResultLabel, TechnicalIssue } from '@hantex/studio';
import { ImageError } from './media';

/**
 * The 3D Product Studio's data in the dashboard (apps/api/src/routes/studio.ts, D-029, D-056):
 * captures and their uploads, the jobs the processing runner works through, and the models it
 * produces, with their reviews.
 */

export interface StudioCapture {
  id: string;
  productId: string;
  variantId: string | null;
  dimensionsMm: { width: number; height: number; depth: number } | null;
  createdAt: string;
}

export interface StudioFile {
  id: string;
  kind: 'photo' | 'cad' | 'model';
  view: CaptureView | null;
  format: string;
  bytes: number;
  widthPx: number | null;
  heightPx: number | null;
  createdAt: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface StudioJob {
  id: string;
  captureId: string;
  providerId: string;
  method: Method;
  finishIds: string[];
  status: JobStatus;
  detail: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type ReviewStatus =
  'pending' | 'ready-for-approval' | 'needs-better-photos' | 'needs-manual-correction';

export type ReviewDecision = Exclude<ReviewStatus, 'pending'>;

interface VersionMeasurements {
  bytes: number;
  triangles: number;
  maxTextureSize: number;
}

export interface StudioModel {
  id: string;
  captureId: string;
  jobId: string;
  label: ResultLabel;
  files: Partial<Record<ModelFile, string>>;
  measurements: {
    desktop?: VersionMeasurements;
    mobile?: VersionMeasurements;
    boundingBoxMm?: { width: number; height: number; depth: number } | null;
  };
  validatorReport: {
    desktop?: { numErrors: number; numWarnings: number; messages: string[] };
    mobile?: { numErrors: number; numWarnings: number; messages: string[] };
  };
  withinScale: boolean | null;
  technicalIssues: TechnicalIssue[];
  reviewStatus: ReviewStatus;
  approvedAt: string | null;
  /** On its product's page: not at all, once Publish changes runs, or now (D-057). */
  /** On its product's page: not, once published, now, or assigned but not shown (D-057, D-058). */
  website: 'none' | 'assigned' | 'live' | 'unshown';
  createdAt: string;
}

export interface StudioReview {
  id: string;
  checklist: Record<string, boolean>;
  decision: ReviewDecision;
  notes: string;
  createdAt: string;
}

export interface CaptureDetail {
  capture: StudioCapture;
  files: StudioFile[];
  jobs: StudioJob[];
  models: StudioModel[];
  eligibility: Eligibility[];
  canCheckTrueScale: boolean;
}

export interface StudioProvider {
  id: string;
  methods: Method[];
  implemented: boolean;
  requires: string;
}

export type ModelFile = 'desktop' | 'mobile' | 'posterFront' | 'posterThreeQuarter';

/** The methods a finished-model upload can be declared as (the `model-import` provider). */
export const IMPORT_METHODS: readonly Method[] = ['artist', 'photogrammetry', 'splat'];

/** What the processing runner can read today (apps/studio-runner/src/pipeline.ts). */
export const MODEL_EXTENSIONS = { glb: 'glb', gltf: 'gltf' } as const;

export const modelFormatOf = (file: File) => {
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  return extension in MODEL_EXTENSIONS
    ? MODEL_EXTENSIONS[extension as keyof typeof MODEL_EXTENSIONS]
    : null;
};

/** A capture upload: `meta` (what it is) and the file itself. */
export function captureForm(
  meta: { kind: 'photo'; view: CaptureView } | { kind: 'model'; format: string },
  file: Blob,
  name: string,
): FormData {
  const form = new FormData();
  form.set('meta', JSON.stringify(meta));
  form.set('file', file, name);
  return form;
}

const MAX_INPUT_BYTES = 40 * 1024 * 1024;
/** Large enough for every capture check (2,000 px on the long side), small enough for phones. */
export const PHOTO_MAX_SIDE = 4096;

/**
 * A capture photo as one WebP, encoded on this device like the media library's images (D-044):
 * re-encoding drops the camera and location data, and the rotation note is applied first.
 */
export async function encodeCapturePhoto(file: File): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('too-large');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('unreadable');
  }
  try {
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new ImageError('unreadable');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.9),
    );
    // Browsers that can't encode WebP silently return PNG instead.
    if (!blob || blob.type !== 'image/webp') throw new ImageError('no-webp');
    return blob;
  } finally {
    bitmap.close();
  }
}
