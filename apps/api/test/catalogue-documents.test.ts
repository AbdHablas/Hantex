import type { Catalogue, DocumentRef, Product, Series } from '@hantex/sections';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakePdf } from './fixtures';
import { createHarness, type Harness } from './harness';

/**
 * Catalogue stage 2 (D-045): series, PDF files and the documents products and series attach,
 * certificate verification, and the catalogue lock. Uses a website of its own.
 */

let h: Harness;
let owner: string;
let admin: string;
let manager: string;
let editor: string;
let outsider: string;
const SITE = 'ct-docs';
const json = async <T>(response: Response) => (await response.json()) as T;
const both = (en: string) => ({ ar: en ? `ع ${en}` : '', en });
const base = `/api/sites/${SITE}/catalogue`;

type Structure = Omit<Catalogue, 'version' | 'products'>;
interface Listing {
  structure: Structure;
  products: { id: string; seriesId: string | null }[];
  issues: { code: string; target: string; detail?: string }[];
}
interface FileItem {
  id: string;
  name: string;
  published: boolean;
  uses: { type: string; id: string }[];
}

const SERIES: Series = {
  id: 'series0001',
  name: both('Line'),
  slug: 'line',
  description: both(''),
  image: null,
  finishIds: ['white00001'],
  documents: [],
};
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
      attributeIds: [],
    },
  ],
  groups: [],
  attributes: [],
  finishes: [
    { id: 'white00001', name: both('White'), swatch: '#ffffff', material: 'plastic', image: null },
  ],
  series: [SERIES],
};

const listing = async () => json<Listing>(await h.request('GET', base, { cookie: owner }));
const files = async (cookie = owner) =>
  (await json<{ items: FileItem[] }>(await h.request('GET', `${base}/files`, { cookie }))).items;
const product = async (id: string) =>
  (
    await json<{ product: Product }>(
      await h.request('GET', `${base}/products/${id}`, { cookie: owner }),
    )
  ).product;
const saveProduct = (id: string, body: Product, cookie = owner) =>
  h.request('PUT', `${base}/products/${id}`, { cookie, body });
const verify = (id: string, documentId: string, verified: boolean, cookie = admin) =>
  h.request('POST', `${base}/verify`, {
    cookie,
    body: { target: { type: 'product', id }, documentId, verified },
  });

function upload(data: ArrayBuffer, cookie = owner, site = SITE) {
  const form = new FormData();
  form.set('meta', JSON.stringify({ name: 'Datasheet.pdf' }));
  form.set('file', new Blob([data], { type: 'application/pdf' }), 'datasheet.pdf');
  return h.request('POST', `/api/sites/${site}/catalogue/files`, { cookie, body: form });
}

async function uploaded(cookie = owner, site = SITE) {
  const response = await upload(fakePdf(), cookie, site);
  expect(response.status, await response.clone().text()).toBe(201);
  return (await json<{ id: string }>(response)).id;
}

async function create(slug: string) {
  const response = await h.request('POST', `${base}/products`, {
    cookie: owner,
    body: { name: both(slug), slug, categoryId: 'switches01' },
  });
  expect(response.status).toBe(201);
  return (await json<{ id: string }>(response)).id;
}

const certificate = (fileId: string, over: Partial<DocumentRef> = {}): DocumentRef => ({
  id: 'cert000001',
  fileId,
  type: 'certificate',
  title: both('Certificate'),
  certificate: { name: 'Mark', number: '', issuer: '', validUntil: null },
  verified: null,
  ...over,
});

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('cd-owner', [{ roleId: 'owner', site: null }]);
  admin = await h.staff('cd-admin', [{ roleId: 'administrator', site: null }]);
  manager = await h.staff('cd-manager', [{ roleId: 'content-manager', site: null }]);
  editor = await h.staff('cd-editor', [{ roleId: 'editor', site: null }]);
  // An administrator of another website only.
  outsider = await h.staff('cd-outsider', [{ roleId: 'administrator', site: 'b' }]);
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

describe('files', () => {
  it('stores checked PDFs privately and offers them to staff as downloads only', async () => {
    const id = await uploaded(editor);
    expect([...h.media.files.keys()].some((k) => k.endsWith(`/files/${id}.pdf`))).toBe(true);
    expect([...h.publicMedia.files.keys()].some((k) => k.includes(id))).toBe(false);
    const download = await h.request('GET', `${base}/files/${id}/file.pdf`, { cookie: editor });
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('application/pdf');
    expect(download.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('refuses files that are not PDFs or carry active content', async () => {
    const html = Uint8Array.from('<html><script>alert(1)</script></html>'.repeat(4), (c) =>
      c.charCodeAt(0),
    ).buffer;
    const notPdf = await upload(html);
    expect(notPdf.status).toBe(400);
    expect(await notPdf.json()).toMatchObject({ details: { reason: 'not-pdf' } });
    const script = await upload(fakePdf('1 0 obj\n<< /S /JavaScript /JS (x) >>\nendobj'));
    expect(await script.json()).toMatchObject({ details: { reason: 'active-content' } });
  });

  it('keeps each website’s files to itself', async () => {
    const id = await uploaded();
    expect((await h.request('GET', `${base}/files`, { cookie: outsider })).status).toBe(404);
    expect(
      (
        await h.request('GET', `/api/sites/second-brand/catalogue/files/${id}/file.pdf`, {
          cookie: outsider,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await h.request('DELETE', `/api/sites/second-brand/catalogue/files/${id}`, {
          cookie: outsider,
        })
      ).status,
    ).toBe(404);
  });

  it('lets only people who may view the catalogue upload or read files', async () => {
    const viewer = await h.staff('cd-viewer', [{ roleId: 'viewer', site: null }]);
    expect((await upload(fakePdf(), viewer)).status).toBe(403);
    expect((await h.request('GET', `${base}/files`, { cookie: viewer })).status).toBe(200);
  });
});

describe('series and documents', () => {
  let productId: string;
  let fileId: string;

  it('refuses series with unknown finishes, and removing a series a product uses', async () => {
    const bad = await h.request('PUT', `${base}/structure`, {
      cookie: owner,
      body: { ...STRUCTURE, series: [{ ...SERIES, finishIds: ['gone000001'] }] },
    });
    expect(bad.status).toBe(400);

    productId = await create('one-gang');
    const p = await product(productId);
    expect(p.seriesId).toBeNull();
    expect((await saveProduct(productId, { ...p, seriesId: 'nothere01' })).status).toBe(400);
    expect((await saveProduct(productId, { ...p, seriesId: SERIES.id })).status).toBe(200);
    expect((await listing()).products[0]?.seriesId).toBe(SERIES.id);

    const removed = await h.request('PUT', `${base}/structure`, {
      cookie: owner,
      body: { ...STRUCTURE, series: [] },
    });
    expect(removed.status).toBe(409);
    expect(await removed.json()).toMatchObject({ error: 'series-in-use' });
  });

  it('ignores verification sent with a save; only the verify action sets it', async () => {
    fileId = await uploaded();
    const p = await product(productId);
    const forged = { by: 'cd-editor', at: '2026-10-27T10:00:00.000Z' };
    const saved = await saveProduct(
      productId,
      { ...p, documents: [certificate(fileId, { verified: forged })] },
      editor,
    );
    expect(saved.status).toBe(200);
    expect((await product(productId)).documents[0]?.verified).toBeNull();

    // Editors and content managers can't verify; administrators can.
    expect((await verify(productId, 'cert000001', true, editor)).status).toBe(403);
    expect((await verify(productId, 'cert000001', true, manager)).status).toBe(403);
    const ok = await verify(productId, 'cert000001', true);
    expect(ok.status, await ok.clone().text()).toBe(200);
    const verified = (await product(productId)).documents[0]?.verified;
    expect(verified?.by).toBe('cd-admin');

    // A save that leaves the document alone keeps it; changing its details clears it.
    const again = await product(productId);
    await saveProduct(productId, { ...again, summary: both('Changed') }, editor);
    expect((await product(productId)).documents[0]?.verified).toEqual(verified);
    const changed = await product(productId);
    const doc = changed.documents[0]!;
    await saveProduct(
      productId,
      { ...changed, documents: [{ ...doc, certificate: { ...doc.certificate!, number: 'X-2' } }] },
      editor,
    );
    expect((await product(productId)).documents[0]?.verified).toBeNull();
  });

  it('verifies certificates only, with a name, on series too', async () => {
    const p = await product(productId);
    const datasheet: DocumentRef = {
      id: 'sheet00001',
      fileId,
      type: 'datasheet',
      title: both('Datasheet'),
      certificate: null,
      verified: null,
    };
    await saveProduct(productId, { ...p, documents: [...p.documents, datasheet] });
    expect((await verify(productId, 'sheet00001', true)).status).toBe(400);

    const series = { ...SERIES, documents: [certificate(fileId)] };
    await h.request('PUT', `${base}/structure`, {
      cookie: owner,
      body: { ...STRUCTURE, series: [series] },
    });
    const response = await h.request('POST', `${base}/verify`, {
      cookie: admin,
      body: { target: { type: 'series', id: SERIES.id }, documentId: 'cert000001', verified: true },
    });
    expect(response.status).toBe(200);
    const structure = (await listing()).structure;
    expect(structure.series[0]?.documents[0]?.verified?.by).toBe('cd-admin');
    // Saving the structure unchanged keeps the verification.
    await h.request('PUT', `${base}/structure`, { cookie: owner, body: structure });
    expect((await listing()).structure.series[0]?.documents[0]?.verified?.by).toBe('cd-admin');
  });

  it('refuses publishing with files from another website, and publishes attached files', async () => {
    const foreign = await uploaded(owner, 'second-brand');
    const p = await product(productId);
    const visible: Product = {
      ...p,
      visible: true,
      documents: [
        ...p.documents.filter((d) => d.type !== 'certificate'),
        { ...certificate(foreign), id: 'cert000002' },
      ],
    };
    await saveProduct(productId, visible);
    expect((await listing()).issues).toContainEqual(
      expect.objectContaining({ code: 'missing-file', detail: foreign }),
    );
    const refused = await h.request('POST', `/api/sites/${SITE}/changes/publish`, {
      cookie: owner,
      body: {},
    });
    expect(refused.status).toBe(409);

    await saveProduct(productId, { ...visible, documents: visible.documents.slice(0, 1) });
    const published = await h.request('POST', `/api/sites/${SITE}/changes/publish`, {
      cookie: owner,
      body: {},
    });
    expect(published.status, await published.clone().text()).toBe(200);
    expect([...h.publicMedia.files.keys()]).toContain(`sites/${SITE}/files/${fileId}.pdf`);
    expect([...h.publicMedia.files.keys()].some((k) => k.includes(foreign))).toBe(false);
    expect((await files()).find((f) => f.id === fileId)?.published).toBe(true);
  });

  it('keeps attached files out of reach of deletion', async () => {
    const response = await h.request('DELETE', `${base}/files/${fileId}`, { cookie: owner });
    expect(response.status).toBe(409);
    const unused = await uploaded();
    expect((await h.request('DELETE', `${base}/files/${unused}`, { cookie: manager })).status).toBe(
      403,
    );
    expect((await h.request('DELETE', `${base}/files/${unused}`, { cookie: owner })).status).toBe(
      200,
    );
    expect([...h.media.files.keys()].some((k) => k.includes(unused))).toBe(false);
  });
});

describe('catalogue lock', () => {
  it('keeps every product when several are created at the same moment', async () => {
    const before = (await listing()).products.length;
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        h.request('POST', `${base}/products`, {
          cookie: owner,
          body: { name: both(`P${i}`), slug: `parallel-${i}`, categoryId: 'switches01' },
        }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect((await listing()).products).toHaveLength(before + 6);
  });

  it('refuses oversized requests', async () => {
    const p = await product((await listing()).products[0]!.id);
    const huge = { ...p, description: { ar: 'x'.repeat(2_000_000), en: '' } };
    const response = await saveProduct((await listing()).products[0]!.id, huge);
    expect(response.status).toBe(400);
  });
});
