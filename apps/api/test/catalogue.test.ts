import { documentVersions, sites } from '@hantex/db/worker';
import type { Catalogue, Product } from '@hantex/sections';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeWebp } from './fixtures';
import { createHarness, type Harness } from './harness';

/**
 * The product catalogue (D-026, D-045): structure, products and variants as drafts, the checks
 * that guard them, and going live through Publish changes. Uses a website of its own.
 */

let h: Harness;
let owner: string;
let editor: string;
let viewer: string;
let manager: string;
const SITE = 'ct-one';
const json = async <T>(response: Response) => (await response.json()) as T;
const both = (en: string) => ({ ar: en ? `ع ${en}` : '', en });
const base = `/api/sites/${SITE}/catalogue`;

type Structure = Omit<Catalogue, 'version' | 'products'>;
interface Listing {
  structure: Structure;
  structureChanged: boolean;
  products: { id: string; slug: string; visible: boolean; published: boolean; changed: boolean }[];
  issues: { code: string; target: string; detail?: string }[];
}

const STRUCTURE: Structure = {
  categories: [
    {
      id: 'switches01',
      name: both('Switches'),
      slug: 'switches',
      parentId: null,
      main: true,
      description: both(''),
      image: null,
      attributeIds: ['gangs00001', 'current001'],
    },
    {
      id: 'lighting01',
      name: both('Lighting'),
      slug: 'lighting',
      parentId: null,
      main: false,
      description: both(''),
      image: null,
      attributeIds: [],
    },
  ],
  groups: [{ id: 'electric01', name: both('Electrical') }],
  attributes: [
    {
      id: 'gangs00001',
      name: both('Gangs'),
      groupId: null,
      type: 'choice',
      unit: '',
      choices: [
        { id: 'gang000001', label: both('1 gang') },
        { id: 'gang000002', label: both('2 gang') },
      ],
      filterable: true,
    },
    {
      id: 'current001',
      name: both('Rated current'),
      groupId: 'electric01',
      type: 'number',
      unit: 'A',
      choices: [],
      filterable: false,
    },
  ],
  finishes: [
    { id: 'white00001', name: both('White'), swatch: '#ffffff', material: 'plastic', image: null },
  ],
  series: [],
};

const listing = async (cookie = owner) => json<Listing>(await h.request('GET', base, { cookie }));
const saveStructure = (body: Structure, cookie = owner) =>
  h.request('PUT', `${base}/structure`, { cookie, body });
const product = async (id: string) =>
  (
    await json<{ product: Product }>(
      await h.request('GET', `${base}/products/${id}`, { cookie: owner }),
    )
  ).product;
const saveProduct = (id: string, body: Product, cookie = owner) =>
  h.request('PUT', `${base}/products/${id}`, { cookie, body });
const publish = (cookie = owner) =>
  h.request('POST', `/api/sites/${SITE}/changes/publish`, { cookie, body: {} });

async function create(name: string, slug: string, categoryId = 'switches01', cookie = owner) {
  const response = await h.request('POST', `${base}/products`, {
    cookie,
    body: { name: both(name), slug, categoryId },
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return json<{ id: string; slug: string }>(response);
}

async function uploadImage(): Promise<string> {
  const form = new FormData();
  form.set('meta', JSON.stringify({ name: 'plate.jpg', alt: { ar: 'مفتاح', en: 'A switch' } }));
  form.set('w480', new Blob([fakeWebp(480, 320)], { type: 'image/webp' }), 'w480.webp');
  const response = await h.request('POST', `/api/sites/${SITE}/media`, {
    cookie: owner,
    body: form,
  });
  expect(response.status, h.errors.at(-1)).toBe(201);
  return (await json<{ id: string }>(response)).id;
}

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('ct-owner', [{ roleId: 'owner', site: null }]);
  editor = await h.staff('ct-editor', [{ roleId: 'editor', site: null }]);
  viewer = await h.staff('ct-viewer', [{ roleId: 'viewer', site: null }]);
  manager = await h.staff('ct-manager', [{ roleId: 'content-manager', site: null }]);
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
});
afterAll(() => h.close());

describe('catalogue structure', () => {
  it('starts empty: no categories, attributes, finishes or products are invented', async () => {
    const list = await listing();
    expect(list.structure).toEqual({
      categories: [],
      groups: [],
      attributes: [],
      finishes: [],
      series: [],
    });
    expect(list.products).toEqual([]);
  });

  it('saves categories, attributes and finishes, and refuses a broken tree', async () => {
    const saved = await saveStructure(STRUCTURE);
    expect(saved.status, await saved.clone().text()).toBe(200);
    expect((await listing()).structure).toEqual(STRUCTURE);

    const orphan = structuredClone(STRUCTURE);
    orphan.categories[1]!.parentId = 'nothere001';
    expect((await saveStructure(orphan)).status).toBe(400);

    const loop = structuredClone(STRUCTURE);
    loop.categories[0]!.parentId = 'lighting01';
    loop.categories[1]!.parentId = 'switches01';
    expect((await saveStructure(loop)).status).toBe(400);

    const duplicate = structuredClone(STRUCTURE);
    duplicate.finishes[0]!.id = 'switches01';
    expect((await saveStructure(duplicate)).status).toBe(400);

    const unit = structuredClone(STRUCTURE);
    unit.attributes[0]!.unit = 'A';
    expect((await saveStructure(unit)).status).toBe(400);
  });

  it('lets editors save drafts, viewers only look, and nobody without access in', async () => {
    expect((await listing(viewer)).structure.categories).toHaveLength(2);
    expect((await saveStructure(STRUCTURE, viewer)).status).toBe(403);
    expect((await saveStructure(STRUCTURE, editor)).status).toBe(200);
    const stranger = await h.staff('ct-stranger', []);
    // Websites a person has no role on don't exist for them.
    expect((await h.request('GET', base, { cookie: stranger })).status).toBe(404);
  });
});

describe('products', () => {
  let id: string;

  it('creates hidden products with no facts, under an existing category only', async () => {
    const created = await create('One-gang switch', 'one-gang');
    id = created.id;
    const p = await product(id);
    expect(p).toMatchObject({ visible: false, values: {}, variants: [], images: [] });
    const unknown = await h.request('POST', `${base}/products`, {
      cookie: owner,
      body: { name: both('X'), slug: 'x', categoryId: 'nothere001' },
    });
    expect(unknown.status).toBe(400);
    // Addresses stay unique: a second product with the same address gets a numbered one.
    expect((await create('Again', 'one-gang')).slug).toBe('one-gang-2');
  });

  it('saves values, variants and images, refusing values outside the schema', async () => {
    const image = await uploadImage();
    const p = await product(id);
    const full: Product = {
      ...p,
      visible: true,
      summary: both('A switch'),
      images: [{ mediaId: image }],
      values: { gangs00001: { choice: 'gang000001' }, current001: { number: 10 } },
      variants: [
        { id: 'variant001', sku: 'HX-100-W', finishId: 'white00001', name: both(''), images: [] },
      ],
    };
    const saved = await saveProduct(id, full);
    expect(saved.status, await saved.clone().text()).toBe(200);
    expect(await product(id)).toEqual(full);

    const script = await saveProduct(id, {
      ...full,
      variants: [{ ...full.variants[0]!, sku: '<b>' }],
    });
    expect(script.status).toBe(400);
    const extra = await saveProduct(id, { ...full, price: 10 } as Product);
    expect(extra.status).toBe(400);
    const elsewhere = await saveProduct(id, { ...full, categoryId: 'nothere001' });
    expect(elsewhere.status).toBe(400);
  });

  it('refuses structure changes that would strand a product', async () => {
    const noCategory = structuredClone(STRUCTURE);
    noCategory.categories = noCategory.categories.filter((c) => c.id !== 'switches01');
    expect(await json<{ error: string }>(await saveStructure(noCategory))).toMatchObject({
      error: 'category-in-use',
    });
    const noFinish = { ...structuredClone(STRUCTURE), finishes: [] };
    expect(await json<{ error: string }>(await saveStructure(noFinish))).toMatchObject({
      error: 'finish-in-use',
    });
    const retyped = structuredClone(STRUCTURE);
    retyped.attributes[1] = { ...retyped.attributes[1]!, type: 'text', unit: '' };
    expect(await json<{ error: string }>(await saveStructure(retyped))).toMatchObject({
      error: 'attribute-in-use',
    });
    const noChoice = structuredClone(STRUCTURE);
    noChoice.attributes[0]!.choices = noChoice.attributes[0]!.choices.slice(1);
    expect(await json<{ error: string }>(await saveStructure(noChoice))).toMatchObject({
      error: 'choice-in-use',
    });
  });

  it('publishes the catalogue with Publish changes, and its images go public', async () => {
    // The editor can prepare drafts but not publish.
    expect((await publish(editor)).status).toBe(403);
    const response = await publish();
    expect(response.status, await response.clone().text()).toBe(200);
    const list = await listing();
    expect(list.structureChanged).toBe(false);
    const first = list.products.find((p) => p.id === id)!;
    expect(first).toMatchObject({ published: true, changed: false });
    const image = (await product(id)).images[0]!.mediaId;
    expect([...h.publicMedia.files.keys()].some((k) => k.includes(image))).toBe(true);
  });

  it('refuses to publish a catalogue with problems, and says what they are', async () => {
    const p = await product(id);
    await saveProduct(id, { ...p, name: { ar: '', en: 'Only English' } });
    const second = await create('Two-gang', 'two-gang');
    const q = await product(second.id);
    await saveProduct(second.id, {
      ...q,
      visible: true,
      variants: [
        { id: 'variant009', sku: 'hx-100-w', finishId: null, name: both('Grey'), images: [] },
      ],
    });
    const response = await publish(manager);
    expect(response.status).toBe(409);
    const body = await json<{ error: string; details: { issues: { code: string }[] } }>(response);
    expect(body.error).toBe('catalogue-issues');
    expect(body.details.issues.map((i) => i.code).sort()).toEqual([
      'duplicate-sku',
      'missing-name',
    ]);
    // The same issues are listed before publishing.
    const changes = await json<{ catalogueIssues: unknown[] }>(
      await h.request('GET', `/api/sites/${SITE}/changes`, { cookie: owner }),
    );
    expect(changes.catalogueIssues).toHaveLength(2);
    await saveProduct(id, p);
    await saveProduct(second.id, { ...q, visible: false });
    const fixed = await publish(manager);
    expect(fixed.status, await fixed.clone().text()).toBe(200);
  });

  it('keeps images products use out of reach of deletion', async () => {
    const image = (await product(id)).images[0]!.mediaId;
    const response = await h.request('DELETE', `/api/sites/${SITE}/media/${image}`, {
      cookie: owner,
    });
    expect(response.status).toBe(409);
    const body = await json<{ details: { catalogue: { type: string; id: string }[] } }>(response);
    expect(body.details.catalogue).toEqual([expect.objectContaining({ type: 'product', id })]);
  });

  it('duplicates a product hidden with empty codes, and restores old versions', async () => {
    const copy = await h.request('POST', `${base}/products/${id}/duplicate`, { cookie: owner });
    expect(copy.status).toBe(201);
    const copied = await product((await json<{ id: string }>(copy)).id);
    expect(copied.visible).toBe(false);
    expect(copied.slug).toBe('one-gang-copy');
    expect(copied.variants.map((x) => x.sku)).toEqual(['']);

    const p = await product(id);
    await saveProduct(id, { ...p, summary: both('Changed') });
    const versions = await json<{ version: number }[]>(
      await h.request('GET', `${base}/products/${id}/versions`, { cookie: owner }),
    );
    const restored = await h.request('POST', `${base}/products/${id}/restore`, {
      cookie: owner,
      body: { version: versions.at(-1)!.version },
    });
    expect(restored.status).toBe(200);
    expect((await product(id)).summary).toEqual(both('A switch'));
  });

  it('deletes products only with the delete permission; the site keeps them until published', async () => {
    expect((await h.request('DELETE', `${base}/products/${id}`, { cookie: manager })).status).toBe(
      403,
    );
    const removed = await h.request('DELETE', `${base}/products/${id}`, { cookie: owner });
    expect(removed.status).toBe(200);
    expect((await listing()).products.some((p) => p.id === id)).toBe(false);
    const [site] = await h.db.select().from(sites).where(eq(sites.key, SITE));
    const rows = await h.db
      .select()
      .from(documentVersions)
      .where(and(eq(documentVersions.siteId, site!.id), eq(documentVersions.kind, 'catalogue')));
    const latest = rows.sort((a, b) => b.version - a.version)[0]!.data as Catalogue;
    // Still listed in the published catalogue until the next Publish changes.
    expect(latest.products).toContain(id);
  });
});
