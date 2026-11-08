/**
 * The AI 3D Product Studio (D-029, D-030): shared types for every way of making a 3D model.
 * Nothing here calls a provider or touches storage — `packages/studio` holds only the facts
 * (what inputs honestly allow, what a result is labelled) that both the dashboard API and the
 * processing runner need to agree on. See `docs/3d-product-studio.md` for the full design.
 */

/** How a model was made. Fixes its result label; a provider can never claim a better one. */
export const METHODS = ['cad', 'photogrammetry', 'splat', 'artist', 'generative'] as const;
export type Method = (typeof METHODS)[number];

/** The label shown in the dashboard and (once published) on the website. */
export const RESULT_LABELS = [
  'exact-cad',
  'measured',
  'artist-modelled',
  'captured-view',
  'ai-estimated',
] as const;
export type ResultLabel = (typeof RESULT_LABELS)[number];

export const LABEL_OF_METHOD: Record<Method, ResultLabel> = {
  cad: 'exact-cad',
  photogrammetry: 'measured',
  artist: 'artist-modelled',
  splat: 'captured-view',
  generative: 'ai-estimated',
};

/** Whether a label may be shown as true-scale interactive 3D, or only as a captured view. */
export const INTERACTIVE_LABELS: readonly ResultLabel[] = [
  'exact-cad',
  'measured',
  'artist-modelled',
  'ai-estimated',
];

/** A view a capture should include, named as the dashboard's capture guide names it. */
export const CAPTURE_VIEWS = ['front', 'left', 'right', 'rear', 'top', 'detail'] as const;
export type CaptureView = (typeof CAPTURE_VIEWS)[number];

/** What kind of file a capture upload is. */
export const CAPTURE_FILE_KINDS = ['photo', 'cad', 'model'] as const;
export type CaptureFileKind = (typeof CAPTURE_FILE_KINDS)[number];

/** One uploaded photo's measurable facts, read from the file itself (never trusted from a form). */
export interface PhotoMeta {
  view: CaptureView;
  widthPx: number;
  heightPx: number;
  /** A rough sharpness score (higher is sharper); undefined when it wasn't measured. */
  sharpness?: number;
}

/** What has been uploaded for one capture, before any job runs. */
export interface CaptureSummary {
  photos: PhotoMeta[];
  /** A CAD file (STEP/IGES) was uploaded. */
  hasCad: boolean;
  /** A finished model file (GLB/OBJ/USDZ/FBX) was uploaded, from a capture app or an artist. */
  hasModel: boolean;
  /** Real width × height × depth in mm, from the datasheet. */
  dimensionsMm: { width: number; height: number; depth: number } | null;
}

/** Money as a whole number of cents, so budgets never drift from floating-point rounding. */
export interface Money {
  currency: 'USD';
  cents: number;
}
export const money = (dollars: number): Money => ({
  currency: 'USD',
  cents: Math.round(dollars * 100),
});
export const addMoney = (a: Money, b: Money): Money => ({
  currency: 'USD',
  cents: a.cents + b.cents,
});
export const moneyToString = (m: Money) => `$${(m.cents / 100).toFixed(2)}`;

/** Whether a method is honestly possible from what was uploaded, and why not if it isn't. */
export interface Eligibility {
  method: Method;
  possible: boolean;
  /** Set when `possible` is false: what is missing. */
  reason?: string;
}

export interface JobInput {
  captureId: string;
  providerId: string;
  /** The uploaded files' storage keys the provider reads from. */
  fileKeys: string[];
  dimensionsMm: CaptureSummary['dimensionsMm'];
  /** The finishes the resulting model should carry as material variants. */
  finishNames: string[];
}

export interface ExternalRef {
  /** An id meaningful to the provider; for in-process providers, the job's own id. */
  ref: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export interface JobProgress {
  status: JobStatus;
  detail?: string;
}

/** The model files a provider hands to the shared optimisation pipeline, before any processing. */
export interface RawModelFiles {
  /** glTF/GLB, OBJ, USDZ or FBX bytes, as the provider produced or received them. */
  bytes: Uint8Array;
  /** The format, so the pipeline knows how to read it. */
  format: 'glb' | 'gltf' | 'obj' | 'usdz' | 'fbx';
}

export interface DataPolicy {
  trainsOnUploads: 'no' | 'yes' | 'opt-out' | 'unknown';
  retention: string;
  /** The date the policy was last checked against the provider's own page. */
  checkedOn: string;
  source: string;
}

/**
 * One way of making a model, behind one interface (D-029's design). `checkInputs` and
 * `estimateCost` are pure and run in the dashboard API; `start`/`poll`/`collect` do the actual
 * work and run only on the processing runner, never in the Cloudflare Worker.
 */
export interface ProviderDescriptor {
  id: string;
  /**
   * The method(s) a job with this provider may declare. Most providers fix exactly one (CAD
   * conversion is always `cad`); `model-import` accepts whichever of `photogrammetry`, `splat`
   * or `artist` the uploader declares the finished file came from — the Studio labels the
   * result by that declaration, never by guessing from the file itself.
   */
  methods: readonly Method[];
  runsOn: 'runner' | 'external-service' | 'person';
  /** False for a provider whose processing isn't built yet: listed, but can't be started. */
  implemented: boolean;
  dataPolicy: DataPolicy;
  /** What this provider needs: e.g. "a CAD file", "at least 20 overlapping photos". */
  requires: string;
}
