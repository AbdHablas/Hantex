import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOGUE,
  catalogueToSheet,
  mergeSheetProduct,
  newProduct,
  parseCsv,
  readNumber,
  readSheet,
  toCsv,
  unguard,
  type Catalogue,
  type Product,
} from './index';

const both = (en: string, ar = `ع ${en}`) => ({ ar, en });

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
        attributeIds: ['gangs00001', 'current001', 'note000001', 'dimmer0001'],
      },
      {
        id: 'sockets001',
        name: both('Sockets'),
        slug: 'sockets',
        parentId: null,
        main: true,
        description: both(''),
        image: null,
        attributeIds: [],
      },
    ],
    groups: [],
    attributes: [
      {
        id: 'gangs00001',
        name: both('Gangs'),
        groupId: null,
        type: 'choice',
        unit: '',
        choices: [
          { id: 'gang000001', label: both('1 gang', 'خط واحد') },
          { id: 'gang000002', label: both('2 gang') },
        ],
        filterable: true,
      },
      {
        id: 'current001',
        name: both('Rated current'),
        groupId: null,
        type: 'number',
        unit: 'A',
        choices: [],
        filterable: false,
      },
      {
        id: 'note000001',
        name: both('Note'),
        groupId: null,
        type: 'text',
        unit: '',
        choices: [],
        filterable: false,
      },
      {
        id: 'dimmer0001',
        name: both('Dimmable'),
        groupId: null,
        type: 'yes-no',
        unit: '',
        choices: [],
        filterable: false,
      },
    ],
    finishes: [
      {
        id: 'white00001',
        name: both('White', 'أبيض'),
        swatch: '#ffffff',
        material: 'plastic',
        image: null,
      },
      {
        id: 'black00001',
        name: both('Black'),
        swatch: '#000000',
        material: 'plastic',
        image: null,
      },
    ],
    series: [
      {
        id: 'series0001',
        name: both('Classic'),
        slug: 'classic',
        description: both(''),
        image: null,
        finishIds: [],
        documents: [],
      },
    ],
    products: ['product001'],
  };
  const product: Product = {
    ...newProduct(both('Switch'), 'switch-1', 'switches01'),
    visible: true,
    images: [{ mediaId: '0b8a6c1e-2f3d-4a5b-8c7d-9e0f1a2b3c4d' }],
    values: {
      gangs00001: { choice: 'gang000001' },
      current001: { number: 10 },
      note000001: { text: both('=SUM(A1)', 'ملاحظة') },
    },
    variants: [
      {
        id: 'variant001',
        sku: 'HX-100',
        finishId: 'white00001',
        name: both('', ''),
        images: [{ mediaId: '1b8a6c1e-2f3d-4a5b-8c7d-9e0f1a2b3c4d' }],
      },
      { id: 'variant002', sku: 'HX-101', finishId: 'black00001', name: both('', ''), images: [] },
    ],
  };
  return { catalogue, products: new Map([['product001', product]]) };
}

let counter = 0;
const newId = () => `newid${String(++counter).padStart(7, '0')}`;

describe('catalogue spreadsheet', () => {
  it('exports one row per variant, and reads its own export back unchanged', () => {
    const { catalogue, products } = sample();
    const sheet = catalogueToSheet(catalogue, products);
    expect(sheet.rows).toHaveLength(3);
    const header = sheet.rows[0] as string[];
    expect(header).toContain('Rated current (A) [current001]');
    expect(header).toContain('Note [note000001:ar]');
    expect(sheet.numeric[header.indexOf('Rated current (A) [current001]')]).toBe(true);
    const row = sheet.rows[1] as string[];
    expect(row[header.indexOf('finish')]).toBe('White');
    expect(row[header.indexOf('Gangs [gangs00001]')]).toBe('1 gang');

    // Through CSV and back: nothing would change, and photos are kept.
    const table = parseCsv(toCsv(sheet.rows));
    expect(table.map((r) => r.map(unguard))).toEqual(sheet.rows);
    const reading = readSheet(table, catalogue, products, newId);
    expect(reading.errors).toEqual([]);
    expect(reading.changes.map((c) => c.status)).toEqual(['unchanged']);
    expect(reading.changes[0]?.product).toEqual(products.get('product001'));
  });

  it('keeps formulas from running in spreadsheet programs, and restores them on import', () => {
    const csv = toCsv([
      ['a', 'b', 'c'],
      ['=SUM(A1)', '-5', '@x'],
    ]);
    expect(csv).toContain(`"'=SUM(A1)","-5","'@x"`);
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('reads CSV written with semicolons, quotes and line breaks', () => {
    expect(parseCsv('address;name_en\r\n"a-b";"Say ""hi""\nthere"\r\n')).toEqual([
      ['address', 'name_en'],
      ['a-b', 'Say "hi"\nthere'],
    ]);
  });

  it('reads numbers as people write them', () => {
    expect(readNumber('2,5')).toBe(2.5);
    expect(readNumber('١٦')).toBe(16);
    expect(readNumber('-0.5')).toBe(-0.5);
    expect(readNumber('16A')).toBeNull();
    expect(readNumber('1e99')).toBeNull();
  });

  it('creates new products and changes only the columns in the file', () => {
    const { catalogue, products } = sample();
    const table = [
      ['address', 'name_en', 'category', 'code', 'finish', 'Rated current (A) [current001]'],
      ['switch-1', 'Switch renamed', 'switches', 'HX-101', 'black', '16'],
      ['switch-1', '', '', 'HX-100', 'أبيض', ''],
      ['new-socket', 'Socket', 'sockets', 'HX-200', '', ''],
    ];
    const reading = readSheet(table, catalogue, products, newId);
    expect(reading.errors).toEqual([]);
    const [changed, created] = reading.changes;
    expect(changed?.status).toBe('changed');
    expect(changed?.product.name).toEqual({ ar: 'ع Switch', en: 'Switch renamed' });
    // Variants matched by code keep their ids and photos, in the file's order.
    expect(changed?.product.variants.map((v) => [v.id, v.finishId])).toEqual([
      ['variant002', 'black00001'],
      ['variant001', 'white00001'],
    ]);
    expect(changed?.product.variants[1]?.images).toHaveLength(1);
    expect(changed?.product.values['current001']).toEqual({ number: 16 });
    // Columns not in the file are kept.
    expect(changed?.product.values['gangs00001']).toEqual({ choice: 'gang000001' });
    expect(changed?.product.images).toHaveLength(1);
    expect(created?.status).toBe('new');
    expect(created?.product.visible).toBe(false);
    expect(created?.product.categoryId).toBe('sockets001');
  });

  it('reports each problem with its row and column', () => {
    const { catalogue, products } = sample();
    const table = [
      ['address', 'category', 'visible', 'finish', 'code', 'Gangs [gangs00001]', 'mystery'],
      ['x', 'switches', 'yes', '', '', '', ''],
    ];
    expect(readSheet(table, catalogue, products, newId).errors).toEqual([
      { row: 1, column: 'mystery', code: 'unknown-column' },
    ]);

    const rows = [
      ['address', 'category', 'visible', 'finish', 'code', 'Gangs [gangs00001]'],
      ['Bad Address', 'switches', '', '', '', ''],
      ['new-1', 'nowhere', 'maybe', 'Red', 'HX 1', '3 gang'],
      ['new-2', '', '', '', '', ''],
      ['new-3', 'sockets', '', '', '', '1 gang'],
      ['switch-1', 'switches', '', '', '', ''],
      ['switch-1', 'sockets', '', '', '', ''],
    ];
    const errors = readSheet(rows, catalogue, products, newId).errors;
    expect(errors).toEqual(
      expect.arrayContaining([
        { row: 2, column: 'address', code: 'invalid-address', detail: 'Bad Address' },
        { row: 3, column: 'category', code: 'unknown-category', detail: 'nowhere' },
        { row: 3, column: 'visible', code: 'invalid-yes-no', detail: 'maybe' },
        { row: 3, column: 'finish', code: 'unknown-finish', detail: 'Red' },
        { row: 3, column: 'code', code: 'invalid-code', detail: 'HX 1' },
        { row: 4, column: 'category', code: 'missing-category' },
        { row: 5, column: 'Gangs [gangs00001]', code: 'not-in-category' },
        { row: 7, column: 'category', code: 'conflicting-values' },
      ]),
    );
  });

  it('refuses unknown products and variants, and files without an address column', () => {
    const { catalogue, products } = sample();
    expect(readSheet([['name_en'], ['x']], catalogue, products, newId).errors[0]?.code).toBe(
      'missing-column',
    );
    const errors = readSheet(
      [
        ['product_id', 'variant_id', 'code'],
        ['product999', '', 'A'],
        ['product001', 'variant999', 'B'],
      ],
      catalogue,
      products,
      newId,
    ).errors;
    expect(errors.map((e) => e.code)).toEqual(['unknown-product', 'unknown-variant']);
  });

  it('checks the result as a product save would', () => {
    const { catalogue, products } = sample();
    const reading = readSheet(
      [
        ['address', 'name_en'],
        ['switch-1', 'x'.repeat(121)],
      ],
      catalogue,
      products,
      newId,
    );
    expect(reading.errors).toEqual([
      expect.objectContaining({ row: 2, column: 'name_en', code: 'invalid' }),
    ]);
  });

  it('merges without touching photos or documents, and refuses unknown variants', () => {
    const { products } = sample();
    const product = products.get('product001') as Product;
    const merged = mergeSheetProduct(
      product,
      { id: 'product001', name: {}, summary: {}, description: {}, variants: [] },
      newId,
    );
    expect(merged.ok && merged.product.variants).toEqual([]);
    expect(merged.ok && merged.product.images).toEqual(product.images);
    expect(
      mergeSheetProduct(
        product,
        {
          id: 'product001',
          name: {},
          summary: {},
          description: {},
          variants: [{ id: 'nothere01', name: {} }],
        },
        newId,
      ),
    ).toEqual({ ok: false, problem: 'unknown-variant', detail: 'nothere01' });
  });
});
