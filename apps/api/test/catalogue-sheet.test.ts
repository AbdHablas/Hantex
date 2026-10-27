import type { Catalogue, Product, SheetProduct } from '@hantex/sections';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakePdf } from './fixtures';
import { createHarness, type Harness } from './harness';

/**
 * Catalogue stage 3 (D-045): the spreadsheet export and the batched import, which merges into
 * the drafts with the same checks as the product form. Uses a website of its own.
 */

let h: Harness;
let owner: string;
let admin: string;
let viewer: string;
let outsider: string;
const SITE = 'ct-sheet';
const json = async <T>(response: Response) => (await response.json()) as T;
const both = (en: string) => ({ ar: en ? `ع ${en}` : '', en });
const base = `/api/sites/${SITE}/catalogue`;

const STRUCTURE: Omit<Catalogue, 'version' | 'products'> = {
  categories: [
    {
      id: 'switches01',
      name: both('Switches'),
      slug: 'switches',
      parentId: null,
      main: true,
      description: both(''),
      image: null,
      attributeIds: ['current001'],
    },
  ],
  groups: [],
  attributes: [
    {
      id: 'current001',
      name: both('Rated current'),
      groupId: null,
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

const item = (over: Partial<SheetProduct>): SheetProduct => ({
  id: null,
  name: {},
  summary: {},
  description: {},
  ...over,
});
const importItems = (items: SheetProduct[], cookie = owner) =>
  h.request('POST', `${base}/import`, { cookie, body: { items } });
const exported = async (cookie = owner) =>
  json<{ catalogue: Catalogue; products: Record<string, Product> }>(
    await h.request('GET', `${base}/export`, { cookie }),
  );

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('cs-owner', [{ roleId: 'owner', site: null }]);
  admin = await h.staff('cs-admin', [{ roleId: 'administrator', site: null }]);
  viewer = await h.staff('cs-viewer', [{ roleId: 'viewer', site: null }]);
  outsider = await h.staff('cs-outsider', [{ roleId: 'administrator', site: 'b' }]);
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
  const saved = await h.request('PUT', `${base}/structure`, { cookie: owner, body: STRUCTURE });
  expect(saved.status, await saved.clone().text()).toBe(200);
});
afterAll(() => h.close());

describe('catalogue spreadsheet', () => {
  it('creates products, then updates them in place on a second import', async () => {
    const first = await importItems([
      item({
        slug: 'one',
        name: { en: 'One', ar: 'واحد' },
        categoryId: 'switches01',
        values: { current001: { number: 10 } },
        variants: [{ id: null, sku: 'SH-1', finishId: 'white00001', name: {} }],
      }),
      item({ slug: 'two', name: { en: 'Two' }, categoryId: 'switches01' }),
    ]);
    expect(first.status, await first.clone().text()).toBe(200);
    expect(await json(first)).toEqual({ created: 2, updated: 0, unchanged: 0 });

    const { catalogue, products } = await exported();
    expect(catalogue.products).toHaveLength(2);
    const one = Object.entries(products).find(([, p]) => p.slug === 'one');
    expect(one?.[1].visible).toBe(false);
    expect(one?.[1].variants[0]?.sku).toBe('SH-1');

    // The same file again changes nothing, matched by address; a new name updates in place.
    const again = await importItems([item({ slug: 'one', name: { en: 'One', ar: 'واحد' } })]);
    expect(await json(again)).toEqual({ created: 0, updated: 0, unchanged: 1 });
    const renamed = await importItems([item({ id: one?.[0] ?? null, name: { en: 'Uno' } })]);
    expect(await json(renamed)).toEqual({ created: 0, updated: 1, unchanged: 0 });
    const after = (await exported()).products[one?.[0] ?? ''];
    expect(after?.name).toEqual({ en: 'Uno', ar: 'واحد' });
    // Variants matched by code keep their id.
    expect(after?.variants[0]?.id).toBe(one?.[1].variants[0]?.id);
    expect((await exported()).catalogue.products).toHaveLength(2);
  });

  it('keeps photos, documents and verified certificates', async () => {
    const form = new FormData();
    form.set('meta', JSON.stringify({ name: 'Cert.pdf' }));
    form.set('file', new Blob([fakePdf()], { type: 'application/pdf' }), 'c.pdf');
    const upload = await h.request('POST', `${base}/files`, { cookie: owner, body: form });
    const fileId = (await json<{ id: string }>(upload)).id;
    const { products } = await exported();
    const [id, product] = Object.entries(products).find(([, p]) => p.slug === 'two') ?? [];
    const withCert: Product = {
      ...(product as Product),
      documents: [
        {
          id: 'cert000001',
          fileId,
          type: 'certificate',
          title: both('Certificate'),
          certificate: { name: 'Mark', number: '1', issuer: 'Lab', validUntil: null },
          verified: null,
        },
      ],
    };
    expect(
      (await h.request('PUT', `${base}/products/${id}`, { cookie: owner, body: withCert })).status,
    ).toBe(200);
    const verified = await h.request('POST', `${base}/verify`, {
      cookie: admin,
      body: { target: { type: 'product', id }, documentId: 'cert000001', verified: true },
    });
    expect(verified.status).toBe(200);

    const imported = await importItems([item({ id: id ?? null, summary: { en: 'Short' } })]);
    expect(imported.status).toBe(200);
    const after = (await exported()).products[id ?? ''];
    expect(after?.summary.en).toBe('Short');
    expect(after?.documents[0]?.verified).not.toBeNull();
  });

  it('refuses the whole batch when one product is wrong', async () => {
    const before = await exported();
    const response = await importItems([
      item({ slug: 'three', categoryId: 'switches01' }),
      item({ slug: 'four', categoryId: 'nowhere001' }),
    ]);
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({
      error: 'unknown-category',
      details: { index: 1 },
    });
    expect((await exported()).catalogue.products).toEqual(before.catalogue.products);
  });

  it('refuses unknown products and variants, repeats, and over-long text', async () => {
    const { products } = await exported();
    const [id] = Object.keys(products);
    const cases: [SheetProduct[], string][] = [
      [[item({ id: 'unknown001', name: { en: 'x' } })], 'unknown-product'],
      [[item({ id: id ?? null, variants: [{ id: 'variant999', name: {} }] })], 'unknown-variant'],
      [
        [item({ slug: 'five', categoryId: 'switches01' }), item({ slug: 'five' })],
        'duplicate-product',
      ],
      [[item({ slug: 'six' })], 'missing-category'],
    ];
    for (const [items, error] of cases) {
      const response = await importItems(items);
      expect(response.status, error).toBe(400);
      expect((await json<{ error: string }>(response)).error).toBe(error);
    }
    const long = await importItems([item({ id: id ?? null, name: { en: 'x'.repeat(121) } })]);
    expect(long.status).toBe(400);
  });

  it('lets viewers export but not import, and keeps other websites out', async () => {
    expect((await h.request('GET', `${base}/export`, { cookie: viewer })).status).toBe(200);
    expect((await importItems([item({ slug: 'seven' })], viewer)).status).toBe(403);
    expect((await h.request('GET', `${base}/export`, { cookie: outsider })).status).toBe(404);
    expect((await importItems([item({ slug: 'seven' })], outsider)).status).toBe(404);
  });
});
