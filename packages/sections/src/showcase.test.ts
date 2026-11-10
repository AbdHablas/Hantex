import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOGUE,
  catalogueIdsOf,
  checkSite,
  collectionsFor,
  compareGroups,
  compareProducts,
  filterGroups,
  formatValue,
  linkSchema,
  newPage,
  newProduct,
  newSection,
  nextRedirects,
  productFilterTokens,
  productsFor,
  publicDocuments,
  redirectPaths,
  sectionSchema,
  showcaseForSections,
  showcaseOf,
  showcaseSchema,
  specGroups,
  type Catalogue,
  type Page,
  type Product,
  type SiteDraft,
} from './index';

const T = (en: string, ar = en) => ({ en, ar });

/** A small catalogue: switches (with a sub-category), lighting, one series, four products. */
function fixture() {
  const catalogue: Catalogue = {
    ...DEFAULT_CATALOGUE,
    categories: [
      {
        id: 'catswitch',
        name: T('Switches'),
        slug: 'switches',
        parentId: null,
        main: true,
        description: T(''),
        image: null,
        attributeIds: ['attgangs', 'attcolour', 'attusb', 'attnote'],
      },
      {
        id: 'catdimmer',
        name: T('Dimmers'),
        slug: 'dimmers',
        parentId: 'catswitch',
        main: false,
        description: T(''),
        image: null,
        attributeIds: [],
      },
      {
        id: 'catlight',
        name: T('Lighting'),
        slug: 'lighting',
        parentId: null,
        main: false,
        description: T(''),
        image: null,
        attributeIds: [],
      },
    ],
    groups: [{ id: 'grpelec', name: T('Electrical') }],
    attributes: [
      {
        id: 'attgangs',
        name: T('Gangs'),
        groupId: 'grpelec',
        type: 'number',
        unit: '',
        choices: [],
        filterable: true,
      },
      {
        id: 'attcolour',
        name: T('Colour'),
        groupId: null,
        type: 'choice',
        unit: '',
        choices: [{ id: 'chwhite', label: T('White', 'أبيض') }],
        filterable: false,
      },
      {
        id: 'attusb',
        name: T('USB'),
        groupId: 'grpelec',
        type: 'yes-no',
        unit: '',
        choices: [],
        filterable: false,
      },
      {
        id: 'attnote',
        name: T('Current'),
        groupId: 'grpelec',
        type: 'number',
        unit: 'A',
        choices: [],
        filterable: false,
      },
    ],
    finishes: [
      { id: 'fnwhite', name: T('White'), swatch: '#ffffff', material: 'plastic', image: null },
    ],
    series: [
      {
        id: 'serone',
        name: T('One'),
        slug: 'one',
        description: T(''),
        image: null,
        finishIds: [],
        documents: [],
        features: [],
      },
    ],
    products: ['prdone', 'prdtwo', 'prdhidden', 'prdlamp'],
  };
  const product = (name: string, categoryId: string, extra: Partial<Product> = {}): Product => ({
    ...newProduct(T(name), name.toLowerCase(), categoryId),
    visible: true,
    ...extra,
  });
  const products = new Map<string, Product>([
    [
      'prdone',
      product('One', 'catswitch', {
        seriesId: 'serone',
        values: { attgangs: { number: 1 }, attusb: { yes: false }, attnote: { number: 10 } },
        variants: [
          { id: 'varone', sku: 'S-1', finishId: 'fnwhite', name: T(''), images: [] },
          { id: 'vartwo', sku: 'S-1B', finishId: 'fnwhite', name: T(''), images: [] },
        ],
        features: [{ id: 'featslim', title: T('Slim'), text: T(''), view: 'right' }],
      }),
    ],
    [
      'prdtwo',
      product('Two', 'catdimmer', {
        values: {
          attgangs: { number: 2 },
          attusb: { yes: false },
          attnote: { number: 10 },
          // A value of the wrong kind never reaches the site.
          attcolour: { number: 3 },
        },
      }),
    ],
    ['prdhidden', product('Hidden', 'catswitch', { visible: false })],
    ['prdlamp', product('Lamp', 'catlight')],
  ]);
  return { catalogue, products, showcase: showcaseOf(catalogue, products) };
}

describe('showcase', () => {
  it('keeps only visible products and values that fit their attribute', () => {
    const { showcase } = fixture();
    expect(showcase.products.map((p) => p.id)).toEqual(['prdone', 'prdtwo', 'prdlamp']);
    expect(showcase.products[1]!.values).not.toHaveProperty('attcolour');
    expect(showcase.products[0]!.finishIds).toEqual(['fnwhite']);
    expect(showcase.products[0]!.features.map((f) => [f.id, f.view])).toEqual([
      ['featslim', 'right'],
    ]);
    expect(showcase.products[1]!.features).toEqual([]);
    expect(JSON.stringify(showcase)).not.toContain('verified');
  });

  it('shows a series’ features on its products that have none of their own (D-060)', () => {
    const { catalogue, products } = fixture();
    const line = { id: 'featline', title: T('One design'), text: T(''), view: 'front' as const };
    catalogue.series[0]!.features = [line];
    // "Two" joins the series without features of its own; "One" keeps its own.
    products.set('prdtwo', { ...products.get('prdtwo')!, seriesId: 'serone' });
    const showcase = showcaseOf(catalogue, products);
    expect(showcase.series[0]!.features).toEqual([line]);
    const byId = new Map(showcase.products.map((p) => [p.id, p.features.map((f) => f.id)]));
    expect(byId.get('prdone')).toEqual(['featslim']);
    expect(byId.get('prdtwo')).toEqual(['featline']);
    expect(byId.get('prdlamp')).toEqual([]);
    expect(showcaseSchema.safeParse(showcase).success).toBe(true);
    // Previews of builder pages draw no features: they are left out.
    const grid = newSection('products');
    grid.settings.source = 'category';
    grid.settings.categoryId = 'catswitch';
    const forPreview = showcaseForSections(showcase, [grid]);
    expect(forPreview.products.length).toBeGreaterThan(0);
    expect(forPreview.products.every((p) => p.features.length === 0)).toBe(true);
    expect(forPreview.series.every((x) => x.features.length === 0)).toBe(true);
  });

  it('passes the same schema previews re-validate it with', () => {
    const { showcase } = fixture();
    expect(showcaseSchema.safeParse(showcase).success).toBe(true);
    const tampered = structuredClone(showcase) as unknown as {
      products: Record<string, unknown>[];
    };
    tampered.products[0]!['price'] = 10;
    expect(showcaseSchema.safeParse(tampered).success).toBe(false);
  });

  it('chooses the products a section shows', () => {
    const { showcase } = fixture();
    const section = newSection('products');
    const ids = () => productsFor(showcase, section.settings).map((p) => p.id);
    expect(ids()).toEqual(['prdone', 'prdtwo', 'prdlamp']);
    section.settings.limit = 2;
    expect(ids()).toEqual(['prdone', 'prdtwo']);
    section.settings.source = 'category';
    section.settings.categoryId = 'catswitch';
    section.settings.limit = 8;
    expect(ids()).toEqual(['prdone', 'prdtwo']);
    section.settings.includeSubcategories = false;
    expect(ids()).toEqual(['prdone']);
    section.settings.source = 'series';
    section.settings.seriesId = 'serone';
    expect(ids()).toEqual(['prdone']);
    section.settings.source = 'picked';
    section.settings.productIds = ['prdlamp', 'prdhidden', 'prdone', 'prdlamp'];
    expect(ids()).toEqual(['prdlamp', 'prdone']);
  });

  it('chooses categories and series', () => {
    const { showcase } = fixture();
    const section = newSection('collections');
    const ids = () => collectionsFor(showcase, section.settings).map((c) => c.item.id);
    expect(ids()).toEqual(['catswitch']);
    section.settings.source = 'subcategories';
    section.settings.categoryId = 'catswitch';
    expect(ids()).toEqual(['catdimmer']);
    section.settings.source = 'series';
    expect(ids()).toEqual(['serone']);
  });

  it('builds specification and comparison tables from entered values only', () => {
    const { showcase } = fixture();
    const one = showcase.products[0]!;
    const groups = specGroups(showcase, one);
    expect(groups.map((g) => g.attributes.map((a) => a.id))).toEqual([
      ['attgangs', 'attusb', 'attnote'],
    ]);
    expect(specGroups(showcase, showcase.products[2]!)).toEqual([]);

    const compare = newSection('compare');
    compare.settings.productIds = ['prdone', 'prdtwo'];
    const products = compareProducts(showcase, compare.settings);
    const rows = (only: boolean) =>
      compareGroups(showcase, products, only).flatMap((g) => g.attributes.map((a) => a.id));
    expect(rows(false)).toEqual(['attgangs', 'attusb', 'attnote']);
    expect(rows(true)).toEqual(['attgangs']);
  });

  it('formats values in each language', () => {
    const { catalogue } = fixture();
    const [gangs, colour, usb, current] = catalogue.attributes as [
      (typeof catalogue.attributes)[0],
      (typeof catalogue.attributes)[0],
      (typeof catalogue.attributes)[0],
      (typeof catalogue.attributes)[0],
    ];
    const words = { yes: 'Yes', no: 'No' };
    expect(formatValue(current, { number: 16 }, 'ar', words)).toBe('16 A');
    expect(formatValue(gangs, { number: 1.5 }, 'en', words)).toBe('1.5');
    expect(formatValue(colour, { choice: 'chwhite' }, 'ar', words)).toBe('أبيض');
    expect(formatValue(usb, { yes: true }, 'en', words)).toBe('Yes');
    expect(formatValue(usb, undefined, 'en', words)).toBe('');
  });

  it('sends previews only the products the page shows or links to', () => {
    const { showcase } = fixture();
    const specs = newSection('specs');
    specs.settings.productId = 'prdtwo';
    expect(showcaseForSections(showcase, [specs]).products.map((p) => p.id)).toEqual(['prdtwo']);
    expect(showcaseForSections(showcase, [], ['prdlamp']).products.map((p) => p.id)).toEqual([
      'prdlamp',
    ]);
  });
});

describe('catalogue links and checks', () => {
  it('accepts links to catalogue items and refuses unknown kinds', () => {
    expect(linkSchema.safeParse({ type: 'product', productId: 'prdone' }).success).toBe(true);
    expect(linkSchema.safeParse({ type: 'category', categoryId: 'catswitch' }).success).toBe(true);
    expect(linkSchema.safeParse({ type: 'series', seriesId: 'serone' }).success).toBe(true);
    expect(linkSchema.safeParse({ type: 'product', productId: '../x' }).success).toBe(false);
    expect(linkSchema.safeParse({ type: 'product', slug: 'one' }).success).toBe(false);
  });

  it('refuses facts typed into product sections', () => {
    const section = newSection('specs') as unknown as { settings: Record<string, unknown> };
    section.settings['rows'] = [{ name: 'Certified', value: 'Yes' }];
    expect(sectionSchema.safeParse(section).success).toBe(false);
  });

  function site(sections: Page['sections'], catalogue = fixture().showcase): SiteDraft {
    const home: Page = { ...newPage(T('Home'), 'home'), sections };
    return {
      index: { order: ['pghome'], home: 'pghome', redirects: [] },
      pages: new Map([['pghome', home]]),
      menus: {
        header: [
          {
            id: 'mnone',
            label: T('Switches'),
            link: { type: 'category', categoryId: 'catswitch' },
            visible: true,
            children: [],
          },
        ],
        footer: [],
      },
      layout: {
        header: {
          sticky: true,
          showLanguage: true,
          showThemeToggle: true,
          button: { label: T(''), link: { type: 'none' } },
        },
        footer: { text: T(''), showContact: true, showSocial: true, copyright: T('') },
      },
      locales: ['ar', 'en'],
      catalogue: catalogueIdsOf(catalogue),
    };
  }

  it('reports incomplete sections and hidden or removed catalogue items', () => {
    const grid = newSection('products');
    grid.settings.source = 'category';
    const compare = newSection('compare');
    compare.settings.productIds = ['prdone', 'prdhidden'];
    const button = newSection('cta');
    button.settings.button.link = { type: 'product', productId: 'prdhidden' };
    const issues = checkSite(site([grid, compare, button]));
    expect(issues).toContainEqual({
      code: 'incomplete-section',
      target: 'page:pghome',
      detail: `${grid.id}:category`,
    });
    expect(issues).toContainEqual({
      code: 'missing-catalogue-item',
      target: 'page:pghome',
      detail: 'product:prdhidden',
    });
    expect(issues).toContainEqual({
      code: 'broken-link',
      target: 'page:pghome',
      detail: 'product:prdhidden',
    });
  });

  it('accepts complete sections and live links, and reports a removed category in a menu', () => {
    const grid = newSection('products');
    grid.settings.source = 'category';
    grid.settings.categoryId = 'catswitch';
    expect(checkSite(site([grid]))).toEqual([]);
    const { catalogue, products } = fixture();
    const without = showcaseOf(
      { ...catalogue, categories: catalogue.categories.filter((c) => c.id !== 'catswitch') },
      products,
    );
    expect(checkSite(site([], without))).toContainEqual({
      code: 'broken-link',
      target: 'menu:header:mnone',
      detail: 'category:catswitch',
    });
  });

  it('keeps catalogue addresses free of pages', () => {
    const draft = site([]);
    draft.pages.set('pghome', { ...newPage(T('Home'), 'product'), sections: [] });
    draft.catalogue = undefined;
    draft.menus.header = [];
    expect(checkSite(draft)).toContainEqual({
      code: 'reserved-address',
      target: 'pghome',
      detail: 'product',
    });
  });
});

describe('documents on the websites', () => {
  const file = '6f1d2c3b-4a5e-4f60-8a71-9b2c3d4e5f60';
  const certificate = {
    id: 'doccert01',
    fileId: file,
    type: 'certificate' as const,
    title: T('Certificate'),
    certificate: { name: 'Mark', number: 'N-1', issuer: 'Lab', validUntil: '2027-01-01' },
    verified: null as { by: string; at: string } | null,
  };
  const datasheet = {
    id: 'docdata01',
    fileId: file,
    type: 'datasheet' as const,
    title: T('Datasheet'),
    certificate: null,
    verified: null,
  };

  it('offers ordinary documents, and certificates only once checked and while valid', () => {
    expect(publicDocuments([datasheet, certificate], '2026-11-04').map((d) => d.id)).toEqual([
      'docdata01',
    ]);
    const verified = { ...certificate, verified: { by: 'owner', at: '2026-11-01T00:00:00.000Z' } };
    expect(publicDocuments([verified], '2026-11-04')).toEqual([
      {
        id: 'doccert01',
        fileId: file,
        type: 'certificate',
        title: T('Certificate'),
        certificate: verified.certificate,
      },
    ]);
    expect(publicDocuments([verified], '2027-01-02')).toEqual([]);
  });
});

describe('redirects for changed addresses (D-050)', () => {
  it('records a changed address and drops one taken again', () => {
    const { catalogue, products } = fixture();
    const before = showcaseOf(catalogue, products);
    const renamed = new Map(products);
    renamed.set('prdone', { ...products.get('prdone')!, slug: 'one-new' });
    const after = showcaseOf(catalogue, renamed);
    const redirects = nextRedirects(before, after, []);
    expect(redirects).toEqual([{ kind: 'product', from: 'one', to: 'prdone' }]);
    expect(redirectPaths({ ...after, redirects })).toEqual([
      { from: '/product/one', to: '/product/one-new' },
    ]);
    // Another product takes the old address: the page wins and the redirect goes.
    const reused = new Map(renamed);
    reused.set('prdtwo', { ...products.get('prdtwo')!, slug: 'one' });
    expect(nextRedirects(after, showcaseOf(catalogue, reused), redirects)).toEqual([
      { kind: 'product', from: 'two', to: 'prdtwo' },
    ]);
    // A hidden product's redirect leads nowhere, so none is written for the site.
    const hidden = new Map(renamed);
    hidden.set('prdone', { ...renamed.get('prdone')!, visible: false });
    expect(redirectPaths({ ...showcaseOf(catalogue, hidden), redirects })).toEqual([]);
  });
});

describe('category filters (D-052)', () => {
  it('offers filterable attributes with at least two values, and finishes', () => {
    const { catalogue, products } = fixture();
    const withFinish = new Map(products);
    withFinish.set('prdtwo', {
      ...products.get('prdtwo')!,
      variants: [{ id: 'vartwo1', sku: '', finishId: 'fnblack', name: T(''), images: [] }],
    });
    const showcase = showcaseOf(
      {
        ...catalogue,
        finishes: [
          ...catalogue.finishes,
          { id: 'fnblack', name: T('Black'), swatch: '#000000', material: 'plastic', image: null },
        ],
      },
      withFinish,
    );
    const groups = filterGroups(showcase, showcase.products);
    // Gangs (filterable, 1 and 2) and the finishes; USB is not filterable, current not either.
    expect(groups.map((g) => g.id)).toEqual(['a:attgangs', 'finish']);
    expect(groups[0]!.options.map((o) => [o.token, o.count])).toEqual([
      ['a:attgangs=1', 1],
      ['a:attgangs=2', 1],
    ]);
    expect(groups[1]!.options.map((o) => o.finishId)).toEqual(['fnwhite', 'fnblack']);
    const one = showcase.products.find((p) => p.id === 'prdone')!;
    expect(productFilterTokens(showcase, one)).toEqual(['a:attgangs=1', 'finish=fnwhite']);
    // One value only: nothing to choose between.
    expect(filterGroups(showcase, [one])).toEqual([]);
  });
});
