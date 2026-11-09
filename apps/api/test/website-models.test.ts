import { randomUUID } from 'node:crypto';
import { documentDrafts, sites, studioCaptures, studioJobs, studioModels } from '@hantex/db/worker';
import type { Product } from '@hantex/sections';
import { REVIEW_CHECKS } from '@hantex/studio';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeWebp } from './fixtures';
import { createHarness, type Harness } from './harness';

/**
 * 3D models on product pages (D-057): the Owner's approval assigns a model to its product, Publish
 * changes takes it live, and only then are its files public; hiding the product or replacing the
 * model takes them back. Uses a website of its own.
 */

let h: Harness;
let owner: string;
let reviewer: string;
let siteId: string;
const SITE = 'models-site';
const base = `/api/sites/${SITE}`;
const json = async <T>(response: Response) => (await response.json()) as T;
const both = (en: string) => ({ ar: `ع ${en}`, en });

const publish = async () => {
  const response = await h.request('POST', `${base}/changes/publish`, { cookie: owner, body: {} });
  expect(response.status, await response.clone().text()).toBe(200);
};

const passingResult = {
  measurements: {
    desktop: { bytes: 1_500_000, triangles: 90_000, maxTextureSize: 2048 },
    mobile: { bytes: 800_000, triangles: 45_000, maxTextureSize: 1024 },
    boundingBoxMm: { width: 86, height: 86, depth: 12 },
    primitivesWithoutMaterial: 0,
  },
  validatorReport: {
    desktop: { numErrors: 0, numWarnings: 0, messages: [] },
    mobile: { numErrors: 0, numWarnings: 0, messages: [] },
  },
  withinScale: true,
};
const PUBLIC_FILES = [
  'desktop.glb',
  'mobile.glb',
  'poster-front.webp',
  'poster-three-quarter.webp',
];
const publicFiles = (modelId: string) =>
  PUBLIC_FILES.filter((file) => h.publicMedia.files.has(`sites/${SITE}/models/${modelId}/${file}`));

/** A published, visible product, as the catalogue tests make one. */
async function visibleProduct(slug: string): Promise<string> {
  const structure = await h.request('PUT', `${base}/catalogue/structure`, {
    cookie: owner,
    body: {
      categories: [
        {
          id: 'switches01',
          name: both('Switches'),
          slug: 'switches',
          parentId: null,
          main: true,
          description: both(''),
          image: null,
          attributeIds: [],
        },
      ],
      groups: [],
      attributes: [],
      finishes: [
        {
          id: 'white00001',
          name: both('White'),
          swatch: '#ffffff',
          material: 'plastic',
          image: null,
        },
      ],
      series: [],
    },
  });
  expect(structure.status, await structure.clone().text()).toBe(200);
  const form = new FormData();
  form.set('meta', JSON.stringify({ name: 'plate.jpg', alt: both('A switch') }));
  form.set('w480', new Blob([fakeWebp(480, 320)], { type: 'image/webp' }), 'w480.webp');
  const image = await json<{ id: string }>(
    await h.request('POST', `${base}/media`, { cookie: owner, body: form }),
  );
  const { id } = await json<{ id: string }>(
    await h.request('POST', `${base}/catalogue/products`, {
      cookie: owner,
      body: { name: both('One-gang switch'), slug, categoryId: 'switches01' },
    }),
  );
  await setVisible(id, true, image.id);
  await publish();
  return id;
}

async function setVisible(productId: string, visible: boolean, imageId?: string) {
  const { product } = await json<{ product: Product }>(
    await h.request('GET', `${base}/catalogue/products/${productId}`, { cookie: owner }),
  );
  const saved = await h.request('PUT', `${base}/catalogue/products/${productId}`, {
    cookie: owner,
    body: {
      ...product,
      visible,
      summary: both('A switch'),
      ...(imageId ? { images: [{ mediaId: imageId }] } : {}),
      variants: product.variants.length
        ? product.variants
        : [
            {
              id: 'variant001',
              sku: `HX-${slugOf(productId)}`,
              finishId: 'white00001',
              name: both(''),
              images: [],
            },
          ],
    },
  });
  expect(saved.status, await saved.clone().text()).toBe(200);
}
const slugOf = (id: string) => id.slice(0, 6).toUpperCase();

/** A model the processing runner made for the product, reviewed and approved by the Owner. */
async function approvedModel(productId: string): Promise<string> {
  const [capture] = await h.db
    .insert(studioCaptures)
    .values({ siteId, productId, widthMm: 86, heightMm: 86, depthMm: 12 })
    .returning();
  const [job] = await h.db
    .insert(studioJobs)
    .values({
      siteId,
      captureId: capture!.id,
      providerId: 'model-import',
      method: 'artist',
      status: 'done',
    })
    .returning();
  const modelId = randomUUID();
  const files = {
    desktop: `${siteId}/models/${modelId}/desktop.glb`,
    mobile: `${siteId}/models/${modelId}/mobile.glb`,
    posterFront: `${siteId}/models/${modelId}/poster-front.webp`,
    posterThreeQuarter: `${siteId}/models/${modelId}/poster-three-quarter.webp`,
  };
  for (const key of Object.values(files)) {
    await h.studio.put(
      key,
      new TextEncoder().encode(key).buffer as ArrayBuffer,
      'application/octet-stream',
    );
  }
  await h.db.insert(studioModels).values({
    id: modelId,
    siteId,
    captureId: capture!.id,
    jobId: job!.id,
    label: 'artist-modelled',
    files,
    ...passingResult,
  });
  const review = await h.request('POST', `${base}/studio/models/${modelId}/review`, {
    cookie: reviewer,
    body: {
      checklist: Object.fromEntries(REVIEW_CHECKS.map((check) => [check, true])),
      decision: 'ready-for-approval',
      notes: '',
    },
  });
  expect(review.status, await review.clone().text()).toBe(201);
  const approved = await h.request('POST', `${base}/studio/models/${modelId}/approve`, {
    cookie: owner,
  });
  expect(approved.status, await approved.clone().text()).toBe(200);
  return modelId;
}

const websiteOf = async (modelId: string) =>
  (
    await json<{ model: { website: string } }>(
      await h.request('GET', `${base}/studio/models/${modelId}`, { cookie: owner }),
    )
  ).model.website;

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('wm-owner', [{ roleId: 'owner', site: null }]);
  reviewer = await h.staff('wm-reviewer', [{ roleId: 'content-manager', site: null }]);
  const created = await h.request('POST', '/api/sites', {
    cookie: owner,
    body: {
      key: SITE,
      name: { ar: 'موقع', en: 'Site' },
      locales: ['ar', 'en'],
      defaultLocale: 'ar',
      template: 'product-showcase',
    },
  });
  expect(created.status).toBe(201);
  const [site] = await h.db.select({ id: sites.id }).from(sites).where(eq(sites.key, SITE));
  siteId = site!.id;
});
afterAll(() => h.close());

describe('3D models on product pages', () => {
  it('assigns an approved model to its product, and makes its files public only once published', async () => {
    const productId = await visibleProduct('one-gang');
    const modelId = await approvedModel(productId);

    expect(await websiteOf(modelId)).toBe('assigned');
    const changes = await json<{ items: { kind: string; allowed: boolean }[] }>(
      await h.request('GET', `${base}/changes`, { cookie: owner }),
    );
    expect(changes.items).toContainEqual({ kind: 'models', key: '', allowed: true });
    expect(publicFiles(modelId)).toEqual([]);

    await publish();
    expect(await websiteOf(modelId)).toBe('live');
    expect(publicFiles(modelId)).toEqual(PUBLIC_FILES);
    const [row] = await h.db.select().from(studioModels).where(eq(studioModels.id, modelId));
    expect(row?.publishedAt).toBeInstanceOf(Date);
  });

  it('takes the files back when the product is hidden, and copies them again when shown', async () => {
    const productId = await visibleProduct('two-gang');
    const modelId = await approvedModel(productId);
    await publish();
    expect(publicFiles(modelId)).toEqual(PUBLIC_FILES);

    await setVisible(productId, false);
    await publish();
    expect(publicFiles(modelId)).toEqual([]);

    await setVisible(productId, true);
    await publish();
    expect(publicFiles(modelId)).toEqual(PUBLIC_FILES);
  });

  it('replaces a product’s model with the newly approved one, takes it off the page, and puts one back', async () => {
    const productId = await visibleProduct('socket');
    const first = await approvedModel(productId);
    await publish();
    const second = await approvedModel(productId);
    expect(await websiteOf(first)).toBe('none');
    await publish();
    expect(publicFiles(first)).toEqual([]);
    expect(publicFiles(second)).toEqual(PUBLIC_FILES);

    // Only the Owner (studio.approve) takes a model off the website.
    expect(
      (await h.request('DELETE', `${base}/studio/models/${second}/website`, { cookie: reviewer }))
        .status,
    ).toBe(403);
    const removed = await h.request('DELETE', `${base}/studio/models/${second}/website`, {
      cookie: owner,
    });
    expect(removed.status).toBe(200);
    expect((await json<{ website: string }>(removed)).website).toBe('none');
    await publish();
    expect(publicFiles(second)).toEqual([]);

    // An approved model goes back on the page (here the older one), again only by the Owner.
    expect(
      (await h.request('PUT', `${base}/studio/models/${first}/website`, { cookie: reviewer }))
        .status,
    ).toBe(403);
    const restored = await h.request('PUT', `${base}/studio/models/${first}/website`, {
      cookie: owner,
    });
    expect(restored.status, await restored.clone().text()).toBe(200);
    expect((await json<{ website: string }>(restored)).website).toBe('assigned');
    await publish();
    expect(await websiteOf(first)).toBe('live');
    expect(publicFiles(first)).toEqual(PUBLIC_FILES);
    expect(publicFiles(second)).toEqual([]);
  });

  it('makes none of a model’s files public while one of them is missing', async () => {
    const productId = await visibleProduct('switch-plate');
    const modelId = await approvedModel(productId);
    const missing = `${siteId}/models/${modelId}/poster-three-quarter.webp`;
    const original = h.studio.files.get(missing)!;
    h.studio.files.delete(missing);
    await publish();
    expect(publicFiles(modelId)).toEqual([]);
    const [row] = await h.db.select().from(studioModels).where(eq(studioModels.id, modelId));
    expect(row?.publishedAt).toBeNull();

    // Once the file is back, a later publish of catalogue or 3D model changes copies them all.
    h.studio.files.set(missing, original);
    await setVisible(productId, false);
    await publish();
    expect(publicFiles(modelId)).toEqual([]);
    await setVisible(productId, true);
    await publish();
    expect(publicFiles(modelId)).toEqual(PUBLIC_FILES);
  });

  it('takes back a half-copied model when copying fails, and copies it on a later publish', async () => {
    const productId = await visibleProduct('fan-switch');
    const modelId = await approvedModel(productId);
    const put = h.publicMedia.put.bind(h.publicMedia);
    h.publicMedia.put = (key, body, contentType) =>
      key.endsWith('/poster-front.webp')
        ? Promise.reject(new Error('storage unavailable'))
        : put(key, body, contentType);
    const failed = await h.request('POST', `${base}/changes/publish`, { cookie: owner, body: {} });
    h.publicMedia.put = put;
    expect(failed.status).toBe(500);
    expect(publicFiles(modelId)).toEqual([]);

    await setVisible(productId, false);
    await publish();
    await setVisible(productId, true);
    await publish();
    expect(publicFiles(modelId)).toEqual(PUBLIC_FILES);
  });

  it('never publishes a models document that names a model nobody approved', async () => {
    const productId = await visibleProduct('dimmer');
    const [capture] = await h.db.insert(studioCaptures).values({ siteId, productId }).returning();
    const [job] = await h.db
      .insert(studioJobs)
      .values({ siteId, captureId: capture!.id, providerId: 'model-import', method: 'artist' })
      .returning();
    const [model] = await h.db
      .insert(studioModels)
      .values({
        siteId,
        captureId: capture!.id,
        jobId: job!.id,
        label: 'artist-modelled',
        files: {},
        ...passingResult,
      })
      .returning();
    await h.db
      .insert(documentDrafts)
      .values({
        siteId,
        kind: 'models',
        key: '',
        data: {
          products: { [productId]: { id: model!.id, label: 'artist-modelled', trueScale: true } },
        },
      })
      .onConflictDoUpdate({
        target: [documentDrafts.siteId, documentDrafts.kind, documentDrafts.key],
        set: {
          data: {
            products: { [productId]: { id: model!.id, label: 'artist-modelled', trueScale: true } },
          },
        },
      });
    const refused = await h.request('POST', `${base}/changes/publish`, { cookie: owner, body: {} });
    expect(refused.status).toBe(409);
    expect(await json<{ error: string }>(refused)).toMatchObject({ error: 'model-not-approved' });
    // Nor can it be put on the page directly.
    const put = await h.request('PUT', `${base}/studio/models/${model!.id}/website`, {
      cookie: owner,
    });
    expect(put.status).toBe(409);
    expect(await json<{ error: string }>(put)).toMatchObject({ error: 'model-not-approved' });
  });
});
