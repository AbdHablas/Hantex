import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_TEMPLATES,
  DEFAULT_CATALOGUE,
  applyAttributeTemplate,
  attributeSchema,
  catalogueSchema,
  checkCatalogue,
  documentRefSchema,
  fileIds,
  isCertified,
  keepVerification,
  newProduct,
  productAttributes,
  productSchema,
  skuSchema,
  type Catalogue,
  type DocumentRef,
  type Product,
} from './index';

const both = (en: string, ar = `ع ${en}`) => ({ ar, en });
const MEDIA = '0b8a6c1e-2f3d-4a5b-8c7d-9e0f1a2b3c4d';
const FILE = '2c9b7d2f-3a4e-4b6c-9d8e-0f1a2b3c4d5e';

function sample(): { catalogue: Catalogue; products: Map<string, Product> } {
  const catalogue: Catalogue = {
    ...DEFAULT_CATALOGUE,
    series: [],
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
  files: ReadonlySet<string> = new Set([FILE]),
) => checkCatalogue({ catalogue, products, locales: ['ar', 'en'], media, files });

const certificate = (over: Partial<DocumentRef> = {}): DocumentRef => ({
  id: 'doc0000001',
  fileId: FILE,
  type: 'certificate',
  title: both('Certificate'),
  certificate: { name: 'Mark', number: 'N-1', issuer: 'Body', validUntil: '2027-01-31' },
  verified: null,
  ...over,
});

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

describe('series and documents', () => {
  it('reads catalogues and products saved before series and documents existed', () => {
    const { series: _series, ...old } = DEFAULT_CATALOGUE;
    expect(catalogueSchema.parse(old).series).toEqual([]);
    const { seriesId: _s, documents: _d, ...oldProduct } = newProduct(both('X'), 'x', 'aaaaaa');
    const product = productSchema.parse(oldProduct);
    expect(product.seriesId).toBeNull();
    expect(product.documents).toEqual([]);
  });

  it('keeps certificate details on certificates only', () => {
    expect(documentRefSchema.safeParse(certificate()).success).toBe(true);
    expect(documentRefSchema.safeParse({ ...certificate(), type: 'datasheet' }).success).toBe(
      false,
    );
    expect(
      documentRefSchema.safeParse({
        ...certificate(),
        type: 'datasheet',
        certificate: null,
        verified: { by: 'user', at: '2026-10-27T10:00:00Z' },
      }).success,
    ).toBe(false);
  });

  it('checks series, their finishes and the series products belong to', () => {
    const s = sample();
    s.catalogue.series.push(
      {
        id: 'series0001',
        name: both('Line'),
        slug: 'line',
        description: both(''),
        image: null,
        finishIds: ['white00001', 'gone000001'],
        documents: [],
      },
      {
        id: 'series0002',
        name: both('Line', ''),
        slug: 'line',
        description: both(''),
        image: null,
        finishIds: [],
        documents: [],
      },
    );
    s.products.get('product001')!.seriesId = 'nothere01';
    const codes = check(s).map((i) => `${i.code}:${i.target}`);
    expect(codes).toContain('missing-finish:series:series0001');
    expect(codes).toContain('missing-name:series:series0002');
    expect(codes).toContain('duplicate-address:series:series0002');
    expect(codes).toContain('missing-series:product:product001');
  });

  it('checks documents: titles, certificate names and files that exist', () => {
    const s = sample();
    const p = s.products.get('product001')!;
    p.documents = [
      certificate({
        title: both('Cert', ''),
        certificate: { name: '', number: '', issuer: '', validUntil: null },
      }),
    ];
    const codes = check(s, undefined, new Set()).map((i) => `${i.code}:${i.detail}`);
    expect(codes).toContain('missing-name:doc0000001');
    expect(codes).toContain('missing-name:doc0000001:certificate');
    expect(codes).toContain(`missing-file:${FILE}`);
    p.documents = [certificate()];
    expect(check(s)).toEqual([]);
    expect(fileIds([s.catalogue, p])).toEqual(new Set([FILE]));
  });

  it('keeps verification only while the file and certificate details are unchanged', () => {
    const verified = { by: 'user-1', at: '2026-10-27T10:00:00.000Z' };
    const before = [certificate({ verified })];
    expect(keepVerification(before, [certificate()])[0]!.verified).toEqual(verified);
    // An editor can't mark a certificate verified by saving it so.
    expect(keepVerification([], [certificate({ verified })])[0]!.verified).toBeNull();
    const other = '3d0c8e3a-4b5f-4c7d-8e9f-1a2b3c4d5e6f';
    expect(keepVerification(before, [certificate({ fileId: other })])[0]!.verified).toBeNull();
    const changed = certificate();
    changed.certificate = { ...changed.certificate!, validUntil: '2030-01-01' };
    expect(keepVerification(before, [changed])[0]!.verified).toBeNull();
  });

  it('shows a certification only when verified and still valid', () => {
    const verified = { by: 'user-1', at: '2026-10-27T10:00:00.000Z' };
    expect(isCertified(certificate(), '2026-10-27')).toBe(false);
    expect(isCertified(certificate({ verified }), '2026-10-27')).toBe(true);
    expect(isCertified(certificate({ verified }), '2027-02-01')).toBe(false);
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
