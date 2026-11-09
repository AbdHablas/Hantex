import { RESULT_LABELS } from '@hantex/studio';
import { z } from 'zod';
import { itemId } from './primitives';

/**
 * The 3D models product pages show (D-029, D-057, D-058): approved 3D Studio models, one for
 * each finish of a product. Each shows its finish as it was photographed or modelled; no finish
 * is recoloured from another's model (D-058). The Owner's approval assigns a model; it goes live
 * with Publish changes, like the catalogue. It holds what the page needs, so the site build reads
 * published documents only, never the Studio.
 */
export const productModelSchema = z.strictObject({
  /** The Studio model. Each website serves its public files at /models/<id>/<file>. */
  id: z.uuid(),
  /** How it was made, which the page says (D-029 §6, "Result types and labels"). */
  label: z.enum(RESULT_LABELS),
  /** Checked true to scale, so the page offers "view on your wall" (AR). */
  trueScale: z.boolean(),
  /** The catalogue finish it shows, or null when its product had no finish to choose. */
  finishId: itemId.nullable(),
});
export type ProductModel = z.infer<typeof productModelSchema>;

const unique = (values: readonly unknown[]) => new Set(values).size === values.length;

export const productModelsSchema = z.strictObject({
  /** By product id: at most one model for each finish. */
  products: z.record(
    itemId,
    z
      .array(productModelSchema)
      .max(60)
      .refine((models) => unique(models.map((m) => m.finishId)), 'One model for each finish')
      .refine((models) => unique(models.map((m) => m.id)), 'Each model once'),
  ),
});
export type ProductModels = z.infer<typeof productModelsSchema>;

export const DEFAULT_PRODUCT_MODELS: ProductModels = { products: {} };

/**
 * The models a product's page shows, in the order of its finishes: one for each of its finishes
 * that has a model. A model made without a finish shows only while none of the product's finishes
 * has one (it was made before the product had finishes, or the product has none). A model of a
 * finish the product no longer has isn't shown.
 */
export function modelsShown(
  models: readonly ProductModel[],
  finishIds: readonly string[],
): ProductModel[] {
  const byFinish = finishIds.flatMap((id) => models.filter((m) => m.finishId === id));
  if (byFinish.length > 0) return byFinish;
  const general = models.find((m) => m.finishId === null);
  return general ? [general] : [];
}

/** A published model's files on the website, under /models/<id>/. */
export const MODEL_FILES = [
  'desktop.glb',
  'mobile.glb',
  'poster-front.webp',
  'poster-three-quarter.webp',
] as const;
export type ModelFileName = (typeof MODEL_FILES)[number];
