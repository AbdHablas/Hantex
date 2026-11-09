import { studioModels, type Database } from '@hantex/db/worker';
import {
  DEFAULT_PRODUCT_MODELS,
  productModelsSchema,
  showcaseOf,
  type ModelFileName,
  type ProductModel,
  type ProductModels,
} from '@hantex/sections';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { publishedCatalogue } from './catalogue-content';
import { currentDraft, latestPublished, saveDraft } from './documents';
import { conflict } from './errors';
import { copyFile, publicModelKey, type MediaStore } from './media-store';

/**
 * 3D models on product pages (D-057). The Owner's approval in the 3D Studio assigns a model to
 * its product in the website's "models" document; Publish changes takes it live, and then its
 * files are copied from the Studio's private bucket to the public one, like images and PDFs.
 */

/** The Studio's file names (apps/studio-runner) and the names the website serves them under. */
const PUBLIC_NAMES: Record<string, ModelFileName> = {
  desktop: 'desktop.glb',
  mobile: 'mobile.glb',
  posterFront: 'poster-front.webp',
  posterThreeQuarter: 'poster-three-quarter.webp',
};

const parse = (data: unknown): ProductModels => {
  const parsed = productModelsSchema.safeParse(data);
  return parsed.success ? parsed.data : DEFAULT_PRODUCT_MODELS;
};

export async function draftModels(db: Pick<Database, 'select'>, siteId: string) {
  return parse((await currentDraft(db, siteId, 'models')).data);
}

export async function liveModels(db: Pick<Database, 'select'>, siteId: string) {
  return parse((await latestPublished(db, siteId, 'models'))?.data);
}

/** Changes the draft under the website's models lock, so two approvals never overwrite each other. */
async function changeDraft(
  db: Database,
  siteId: string,
  userId: string,
  change: (models: ProductModels) => ProductModels | null,
) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`models:${siteId}`}, 0))`);
    const next = change(await draftModels(tx, siteId));
    if (next) await saveDraft(tx, siteId, 'models', next, userId);
  });
}

export function assignModel(
  db: Database,
  siteId: string,
  productId: string,
  model: ProductModel,
  userId: string,
) {
  return changeDraft(db, siteId, userId, (models) => ({
    products: { ...models.products, [productId]: model },
  }));
}

/** Takes a model off its product's page (once published); does nothing if another replaced it. */
export function unassignModel(
  db: Database,
  siteId: string,
  productId: string,
  modelId: string,
  userId: string,
) {
  return changeDraft(db, siteId, userId, (models) => {
    if (models.products[productId]?.id !== modelId) return null;
    const products = { ...models.products };
    delete products[productId];
    return { products };
  });
}

/** Publish changes refuses a models document that names anything but an approved model here. */
export async function requireApprovedModels(
  db: Pick<Database, 'select'>,
  siteId: string,
  models: ProductModels,
) {
  const ids = [...new Set(Object.values(models.products).map((m) => m.id))];
  if (ids.length === 0) return;
  const approved = await db
    .select({ id: studioModels.id })
    .from(studioModels)
    .where(
      and(
        eq(studioModels.siteId, siteId),
        inArray(studioModels.id, ids),
        isNotNull(studioModels.approvedAt),
      ),
    );
  if (approved.length !== ids.length) throw conflict('model-not-approved');
}

/** Where a model stands on the website: not assigned, assigned (waiting to publish), or live. */
export function websiteStatus(
  draft: ProductModels,
  live: ProductModels,
  productId: string,
  modelId: string,
): 'none' | 'assigned' | 'live' {
  if (live.products[productId]?.id === modelId && draft.products[productId]?.id === modelId) {
    return 'live';
  }
  return draft.products[productId]?.id === modelId ? 'assigned' : 'none';
}

/**
 * After Publish changes: copies the files of every model a visible product shows to the public
 * bucket, and takes back those no longer shown (a hidden or removed product, a replaced model).
 * The Studio keeps its originals, so publishing a model again copies it back.
 */
export async function syncModelFiles(
  db: Database,
  stores: { studio: MediaStore; public: MediaStore },
  site: { id: string; key: string },
): Promise<{ published: number; withdrawn: number }> {
  const live = await publishedCatalogue(db, site.id);
  const shown = new Set(
    showcaseOf(live.catalogue, live.products, await liveModels(db, site.id)).products.flatMap(
      (p) => (p.model ? [p.model.id] : []),
    ),
  );

  let published = 0;
  if (shown.size > 0) {
    const waiting = await db
      .select({ id: studioModels.id, files: studioModels.files })
      .from(studioModels)
      .where(
        and(
          eq(studioModels.siteId, site.id),
          inArray(studioModels.id, [...shown]),
          isNotNull(studioModels.approvedAt),
          isNull(studioModels.publishedAt),
        ),
      );
    for (const row of waiting) {
      // All four files go public, or none: half a model is taken back at once, since only a
      // published model's files are ever withdrawn later. The next publish tries it again.
      const keys = Object.values(PUBLIC_NAMES).map((name) =>
        publicModelKey(site.key, row.id, name),
      );
      let copied = 0;
      try {
        for (const [name, key] of Object.entries(row.files as Record<string, string>)) {
          const publicName = PUBLIC_NAMES[name];
          if (!publicName) continue;
          const to = publicModelKey(site.key, row.id, publicName);
          if (await copyFile(stores.studio, key, stores.public, to)) copied++;
        }
      } catch (error) {
        await stores.public.delete(keys).catch(() => undefined);
        throw error;
      }
      if (copied === keys.length) {
        await db
          .update(studioModels)
          .set({ publishedAt: new Date() })
          .where(eq(studioModels.id, row.id));
        published++;
      } else {
        await stores.public.delete(keys);
      }
    }
  }

  const public_ = await db
    .select({ id: studioModels.id })
    .from(studioModels)
    .where(and(eq(studioModels.siteId, site.id), isNotNull(studioModels.publishedAt)));
  const withdrawn = public_.filter((row) => !shown.has(row.id));
  if (withdrawn.length > 0) {
    await stores.public.delete(
      withdrawn.flatMap((row) =>
        Object.values(PUBLIC_NAMES).map((name) => publicModelKey(site.key, row.id, name)),
      ),
    );
    await db
      .update(studioModels)
      .set({ publishedAt: null })
      .where(
        inArray(
          studioModels.id,
          withdrawn.map((row) => row.id),
        ),
      );
  }
  return { published, withdrawn: withdrawn.length };
}
