import {
  newSection,
  type Catalogue,
  type Page,
  type Product,
  type Showcase,
} from '@hantex/sections';
import { documentVersions, sites } from '@hantex/db/worker';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';

/**
 * Product sections and catalogue links (D-048): pages may name only public catalogue items,
 * Publish changes checks pages against the catalogue that will be live, and previews carry only
 * the products the page shows. Uses a website of its own.
 */

let h: Harness;
let owner: string;
const SITE = 'ps-one';
const json = async <T>(response: Response) => (await response.json()) as T;
const both = (en: string) => ({ ar: `ع ${en}`, en });
const catalogueBase = `/api/sites/${SITE}/catalogue`;

type Structure = Omit<Catalogue, 'version' | 'products' | 'redirects'>;
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
  finishes: [],
  series: [],
};

const siteId = async () =>
  (await h.db.select({ id: sites.id }).from(sites).where(eq(sites.key, SITE)))[0]?.id;
const publish = () =>
  h.request('POST', `/api/sites/${SITE}/changes/publish`, { cookie: owner, body: {} });
const getProduct = async (id: string) =>
  (
    await json<{ product: Product }>(
      await h.request('GET', `${catalogueBase}/products/${id}`, { cookie: owner }),
    )
  ).product;
const saveProduct = (id: string, body: Product) =>
  h.request('PUT', `${catalogueBase}/products/${id}`, { cookie: owner, body });
const getPage = async (id: string) =>
  (
    await json<{ page: Page }>(
      await h.request('GET', `/api/sites/${SITE}/pages/${id}`, { cookie: owner }),
    )
  ).page;
const savePage = (id: string, body: Page) =>
  h.request('PUT', `/api/sites/${SITE}/pages/${id}`, { cookie: owner, body });

async function visibleProduct(name: string, slug: string, current: number) {
  const response = await h.request('POST', `${catalogueBase}/products`, {
    cookie: owner,
    body: { name: both(name), slug, categoryId: 'switches01' },
  });
  expect(response.status, await response.clone().text()).toBe(201);
  const { id } = await json<{ id: string }>(response);
  const p = await getProduct(id);
  const saved = await saveProduct(id, {
    ...p,
    visible: true,
    values: { current001: { number: current } },
  });
  expect(saved.status, await saved.clone().text()).toBe(200);
  return id;
}

let home: string;
let one: string;
let two: string;

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('ps-owner', [{ roleId: 'owner', site: null }]);
  const created = await h.request('POST', '/api/sites', {
    cookie: owner,
    body: {
      key: SITE,
      name: { ar: 'موقع', en: 'Site' },
      locales: ['ar', 'en'],
      defaultLocale: 'ar',
      template: 'product-showcase',
      startFrom: { starter: 'blank' },
    },
  });
  expect(created.status).toBe(201);
  const domain = await h.request('POST', `/api/sites/${SITE}/domains`, {
    cookie: owner,
    body: { hostname: 'ps-one.example.com', isPrimary: true },
  });
  expect(domain.status).toBeLessThan(300);
  const structure = await h.request('PUT', `${catalogueBase}/structure`, {
    cookie: owner,
    body: STRUCTURE,
  });
  expect(structure.status, await structure.clone().text()).toBe(200);
  one = await visibleProduct('One', 'one', 10);
  two = await visibleProduct('Two', 'two', 16);
  const pages = await json<{ home: string }>(
    await h.request('GET', `/api/sites/${SITE}/pages`, { cookie: owner }),
  );
  home = pages.home;
  const first = await publish();
  expect(first.status, await first.clone().text()).toBe(200);
});
afterAll(() => h.close());

describe('product sections', () => {
  it('refuses settings that carry facts instead of catalogue references', async () => {
    const page = await getPage(home);
    const specs = newSection('specs') as unknown as { settings: Record<string, unknown> };
    specs.settings['values'] = { current001: '32 A' };
    const response = await savePage(home, { ...page, sections: [specs as never] });
    expect(response.status).toBe(400);
  });

  it('publishes complete product sections, and refuses incomplete ones', async () => {
    const page = await getPage(home);
    const compare = newSection('compare');
    compare.settings.productIds = [one];
    expect((await savePage(home, { ...page, sections: [compare] })).status).toBe(200);
    const refused = await publish();
    expect(refused.status).toBe(409);
    const body = await json<{ error: string; details: { issues: { code: string }[] } }>(refused);
    expect(body.error).toBe('site-issues');
    expect(body.details.issues.map((i) => i.code)).toEqual(['incomplete-section']);

    compare.settings.productIds = [one, two];
    const specs = newSection('specs');
    specs.settings.productId = one;
    const cta = newSection('cta');
    cta.settings.button = {
      label: both('See it'),
      link: { type: 'category', categoryId: 'switches01' },
    };
    expect((await savePage(home, { ...page, sections: [compare, specs, cta] })).status).toBe(200);
    const published = await publish();
    expect(published.status, await published.clone().text()).toBe(200);
  });

  it('refuses to hide a product a live page names, and says which page', async () => {
    const p = await getProduct(two);
    expect((await saveProduct(two, { ...p, visible: false })).status).toBe(200);
    const listed = await json<{ issues: { code: string; detail?: string }[] }>(
      await h.request('GET', `/api/sites/${SITE}/changes`, { cookie: owner }),
    );
    expect(listed.issues).toContainEqual({
      code: 'missing-catalogue-item',
      target: `page:${home}`,
      detail: `product:${two}`,
    });
    const refused = await publish();
    expect(refused.status).toBe(409);
    const body = await json<{ error: string; details: { issues: { detail?: string }[] } }>(refused);
    expect(body.error).toBe('site-issues');
    expect(body.details.issues.map((i) => i.detail)).toEqual([`product:${two}`]);
    // Showing it again lets the catalogue go live.
    expect((await saveProduct(two, p)).status).toBe(200);
  });

  it('sends previews only the products the page shows', async () => {
    const three = await visibleProduct('Three', 'three', 20);
    const response = await h.request('POST', `/api/sites/${SITE}/preview`, {
      cookie: owner,
      body: {
        drafts: { 'coming-soon': false, 'site-settings': false, theme: false, builder: true },
        page: home,
      },
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const { fields } = await json<{ fields: { payload: string } }>(response);
    const base64 = fields.payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(decoded)) as {
      data: { builder: { showcase: Showcase } };
    };
    const showcase = payload.data.builder.showcase;
    expect(showcase.products.map((p) => p.id).sort()).toEqual([one, two].sort());
    expect(showcase.products.map((p) => p.id)).not.toContain(three);
    expect(showcase.categories.map((c) => c.id)).toEqual(['switches01']);
    expect(showcase.products.every((p) => p.documents.length === 0)).toBe(true);
  });

  it('leaves a redirect when a product address changes (D-050)', async () => {
    const p = await getProduct(one);
    expect((await saveProduct(one, { ...p, slug: 'one-renamed' })).status).toBe(200);
    const published = await publish();
    expect(published.status, await published.clone().text()).toBe(200);
    const [row] = await h.db
      .select({ data: documentVersions.data })
      .from(documentVersions)
      .where(
        and(eq(documentVersions.kind, 'catalogue'), eq(documentVersions.siteId, (await siteId())!)),
      )
      .orderBy(desc(documentVersions.version))
      .limit(1);
    expect((row?.data as Catalogue).redirects).toEqual([{ kind: 'product', from: 'one', to: one }]);
    // The draft keeps it too, so the catalogue shows no unpublished change.
    const listing = await json<{ structureChanged: boolean }>(
      await h.request('GET', catalogueBase, { cookie: owner }),
    );
    expect(listing.structureChanged).toBe(false);
  });
});
