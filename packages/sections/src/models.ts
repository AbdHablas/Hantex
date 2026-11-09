import { RESULT_LABELS } from '@hantex/studio';
import { z } from 'zod';
import { itemId } from './primitives';

/**
 * The 3D models product pages show (D-029, D-057): one approved 3D Studio model per product. The
 * Owner's approval assigns it; it goes live with Publish changes, like the catalogue. It holds
 * what the page needs, so the site build reads published documents only, never the Studio.
 */
export const productModelSchema = z.strictObject({
  /** The Studio model. Each website serves its public files at /models/<id>/<file>. */
  id: z.uuid(),
  /** How it was made, which the page says (D-029 §6, "Result types and labels"). */
  label: z.enum(RESULT_LABELS),
  /** Checked true to scale, so the page offers "view on your wall" (AR). */
  trueScale: z.boolean(),
});
export type ProductModel = z.infer<typeof productModelSchema>;

export const productModelsSchema = z.strictObject({
  /** By product id. */
  products: z.record(itemId, productModelSchema),
});
export type ProductModels = z.infer<typeof productModelsSchema>;

export const DEFAULT_PRODUCT_MODELS: ProductModels = { products: {} };

/** A published model's files on the website, under /models/<id>/. */
export const MODEL_FILES = [
  'desktop.glb',
  'mobile.glb',
  'poster-front.webp',
  'poster-three-quarter.webp',
] as const;
export type ModelFileName = (typeof MODEL_FILES)[number];
