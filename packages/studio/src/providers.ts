import type { ProviderDescriptor } from './types';

/**
 * The providers stage 1 ships (D-029 §5, §6). Both cost nothing per model, so a budget check
 * always passes for them; paid providers (photogrammetry services, generative AI) are added in
 * a later stage once the Owner approves one and sets its budget (D-030).
 *
 * `model-import` is the one that actually runs: a finished model (GLB, OBJ, USDZ or FBX) from a
 * capture app such as Apple Object Capture, or from a 3D artist, is read as-is and carried
 * through the shared optimisation pipeline. The person uploading declares which method produced
 * it (`photogrammetry`, `splat` or `artist`); the Studio labels the result by that declared
 * method, never by guessing from the file.
 *
 * `cad-step` is registered so the architecture already has a place for it, but its conversion
 * (STEP/IGES geometry) isn't built: no CAD files exist yet (D-029), and building it honestly
 * needs a real CAD kernel, which is a separate piece of work. `implemented: false` keeps the
 * dashboard from offering to start a job with it until that's done — the Studio never claims a
 * result it hasn't actually produced.
 */
export const PROVIDERS: readonly ProviderDescriptor[] = [
  {
    id: 'model-import',
    // The method is the one declared for the import (see `src/routes/studio.ts`); this entry
    // is the registry's description of the import path itself.
    method: 'artist',
    runsOn: 'runner',
    implemented: true,
    dataPolicy: {
      trainsOnUploads: 'no',
      retention: "kept in the website's private storage until deleted",
      checkedOn: '2026-11-08',
      source: 'docs/3d-product-studio.md',
    },
    requires: 'a GLB, OBJ, USDZ or FBX file, from a capture app or a 3D artist',
  },
  {
    id: 'cad-step',
    method: 'cad',
    runsOn: 'runner',
    implemented: false,
    dataPolicy: {
      trainsOnUploads: 'no',
      retention: "kept in the website's private storage until deleted",
      checkedOn: '2026-11-08',
      source: 'docs/3d-product-studio.md',
    },
    requires: 'a STEP or IGES file (not yet built: no CAD conversion pipeline exists yet)',
  },
];

export const providerById = (id: string): ProviderDescriptor | undefined =>
  PROVIDERS.find((p) => p.id === id);
