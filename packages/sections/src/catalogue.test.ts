import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_TEMPLATES,
  DEFAULT_CATALOGUE,
  applyAttributeTemplate,
  attributeSchema,
  catalogueSchema,
  checkCatalogue,
  newProduct,
  productAttributes,
  productSchema,
  skuSchema,
  type Catalogue,
  type Product,
} from './index';

const both = (en: string, ar = `ع ${en}`) => ({ ar, en });
const MEDIA = '0b8a6c1e-2f3d-4a5b-8c7d-9e0f1a2b3c4d';

function sample(): { catalogue: Catalogue; products: Map<string, Product> } {
  const catalogue: Catalogue = {
    ...DEFAULT_CATALOGUE,
    categories: [
      {
        id: 'switches01',
        name: both('Switches'),
        slug: 'switches',
        parentId: null,
        main: true,
        description: both(''),
        image: null,
        attributeIds: ['gangs00001'],
      },
      {
        id: 'oneway0001',
        name: both('One-way'),
        slug: 'one-way',
        parentId: 'switches01',
        main: false,
        description: both(''),
        image: null,
        attributeIds: ['current001'],
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
        choices: [{ id: 'gang000001', label: both('1 gang') }],
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
      {
        id: 'white00001',
        name: both('White'),
        swatch: '#ffffff',
        material: 'plastic',
        image: null,
      },
    ],
    products: ['product001'],
  };
  const product: Product = {
    ...newProduct(both('Switch'), 'switch-1', 'oneway0001'),
    visible: true,
    values: { gangs00001: { choice: 'gang000001' }, current001: { number: 10 } },
    variants: [
      { id: 'variant001', sku: 'HX-100', finishId: 'white00001', name: both(''), images: [] },
    ],
    images: [{ mediaId: MEDIA }],
  };
  return { catalogue, products: new Map([['product001', product]]) };
}

const check = (
  { catalogue, products }: ReturnType<typeof sample>,
  media: ReadonlySet<string> = new Set([MEDIA]),
) => checkCatalogue({ catalogue, products, locales: ['ar', 'en'], media });

describe('catalogue', () => {
  it('accepts an empty catalogue and a complete sample', () => {
    expect(catalogueSchema.safeParse(DEFAULT_CATALOGUE).success).toBe(true);
    const s = sample();
    expect(catalogueSchema.safeParse(s.catalogue).success).toBe(true);
    expect(productSchema.safeParse(s.products.get('product001')).success).toBe(true);
    expect(check(s)).toEqual([]);
  });

  it('starts new products hidden with no facts filled in', () => {
    const p = newProduct(both('X'), 'x', 'switches01');
    expect(p.visible).toBe(false);
    expect(p.values).toEqual({});
    expect(p.variants).toEqual([]);
  });

  it('refuses units on non-numbers, choices on non-choices and bad codes', () => {
    const base = sample().catalogue.attributes[1]!;
    expect(attributeSchema.safeParse({ ...base, type: 'text' }).success).toBe(false);
    expect(
      attributeSchema.safeParse({
        ...base,
        unit: '',
        choices: [{ id: 'aaaaaa', label: both('a') }],
      }).success,
    ).toBe(false);
    expect(skuSchema.safeParse('HX-100/W.2').success).toBe(true);
    expect(skuSchema.safeParse('').success).toBe(true);
    expect(skuSchema.safeParse('<script>').success).toBe(false);
    expect(skuSchema.safeParse('-lead').success).toBe(false);
  });

  it('inherits attributes from parent categories', () => {
    const s = sample();
    const ids = productAttributes(s.catalogue, s.products.get('product001')!).map((a) => a.id);
    expect(ids.sort()).toEqual(['current001', 'gangs00001']);
  });

  it('reports values that do not fit or belong', () => {
    const s = sample();
    const p = s.products.get('product001')!;
    p.values = {
      current001: { text: both('ten') },
      gangs00001: { choice: 'nochoice01' },
      unknown001: { yes: true },
    };
    const codes = check(s).map((i) => `${i.code}:${i.detail}`);
    expect(codes).toContain('wrong-value:current001');
    expect(codes).toContain('wrong-value:gangs00001');
    expect(codes).toContain('missing-attribute:unknown001');
  });

  it('reports missing translations, duplicates and broken references', () => {
    const s = sample();
    s.catalogue.categories.push({
      ...s.catalogue.categories[0]!,
      id: 'switches02',
      name: both('Copy', ''),
    });
    const p = s.products.get('product001')!;
    s.products.set('product002', { ...structuredClone(p), categoryId: 'nothere01' });
    s.catalogue.products.push('product002', 'product003');
    p.variants.push({
      id: 'variant002',
      sku: 'hx-100',
      finishId: 'gone000001',
      name: both(''),
      images: [],
    });
    const codes = check(s, new Set()).map((i) => `${i.code}:${i.target}`);
    expect(codes).toContain('missing-name:category:switches02');
    expect(codes).toContain('duplicate-address:category:switches02');
    expect(codes).toContain('missing-category:product:product002');
    expect(codes).toContain('duplicate-address:product:product002');
    expect(codes).toContain('missing-product:product:product003');
    expect(codes).toContain('missing-finish:product:product001');
    expect(codes).toContain('duplicate-sku:product:product001');
    expect(codes).toContain('missing-image:product:product001');
  });

  it('limits the tree to three levels and catches loops', () => {
    const s = sample();
    const [top] = s.catalogue.categories;
    const level = (id: string, parentId: string) => ({ ...top!, id, slug: id, parentId });
    s.catalogue.categories.push(
      level('level30001', 'oneway0001'),
      level('level40001', 'level30001'),
    );
    s.catalogue.categories[0] = { ...top!, parentId: 'oneway0001' };
    const codes = check(s).map((i) => `${i.code}:${i.target}`);
    expect(codes).toContain('nested-too-deep:category:level40001');
    expect(codes).toContain('nested-too-deep:category:switches01');
  });

  it('checks hidden products only for what would break the catalogue', () => {
    const s = sample();
    const p = s.products.get('product001')!;
    p.visible = false;
    p.name = both('', '');
    p.images = [{ mediaId: '1b8a6c1e-2f3d-4a5b-8c7d-9e0f1a2b3c4d' }];
    expect(check(s)).toEqual([]);
    p.categoryId = 'nothere01';
    expect(check(s).map((i) => i.code)).toEqual(['missing-category']);
  });
});

describe('starter attribute templates', () => {
  it('add valid definitions once, with no values', () => {
    let n = 0;
    const id = () => `tpl${String(++n).padStart(5, '0')}`;
    for (const template of ATTRIBUTE_TEMPLATES) {
      const once = applyAttributeTemplate(DEFAULT_CATALOGUE, template, id);
      const { added, ...structure } = once;
      expect(catalogueSchema.safeParse(structure).success, template.id).toBe(true);
      expect(added.length).toBe(template.attributes.length);
      expect(
        checkCatalogue({ catalogue: structure, products: new Map(), locales: ['ar', 'en'] }),
      ).toEqual([]);
      const twice = applyAttributeTemplate(structure, template, id);
      expect(twice.added).toEqual([]);
      expect(twice.groups).toHaveLength(structure.groups.length);
    }
  });
});
