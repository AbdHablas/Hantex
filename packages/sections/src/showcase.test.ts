import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOGUE,
  catalogueIdsOf,
  checkSite,
  collectionsFor,
  compareGroups,
  compareProducts,
  formatValue,
  linkSchema,
  newPage,
  newProduct,
  newSection,
  productsFor,
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
    expect(JSON.stringify(showcase)).not.toContain('documents');
  });

  it('passes the same schema previews re-validate it with', () => {
    const { showcase } = fixture();
    expect(showcaseSchema.safeParse(showcase).success).toBe(true);
    const tampered = structuredClone(showcase) as unknown as {
      products: Record<string, unknown>[];
    };
    tampered.products[0]!['documents'] = [];
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
