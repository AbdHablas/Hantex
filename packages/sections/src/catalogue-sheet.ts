import { z } from 'zod';
import {
  MAX_PRODUCTS,
  newProduct,
  productAttributes,
  productSchema,
  skuSchema,
  type Attribute,
  type AttributeValue,
  type Catalogue,
  type Product,
} from './catalogue';
import { itemId, slugSchema, type Bilingual } from './primitives';

/**
 * Products and variants as a spreadsheet (D-045, stage 3): one row per variant, or one row for a
 * product without variants. The same code reads a CSV or Excel file in the dashboard (to show
 * what an import would change) and merges each product into the draft in the API, where every
 * product is then checked by `productSchema` exactly like a save from the product form.
 *
 * - Products are matched by `product_id`, or by `address` when the id is empty; anything else is
 *   a new product. Products missing from the file are left alone: an import never deletes one.
 * - Only the columns in the file are changed. A column that is there but empty clears that
 *   field; a column that is not there keeps what the product has.
 * - Photos and documents are never in the file, and stay as they are. Variants are matched by
 *   `variant_id`, or by code, so theirs stay too.
 */

const LANGS = ['ar', 'en'] as const;
type Lang = (typeof LANGS)[number];

/** The fixed columns, in the order an export writes them. */
export const SHEET_COLUMNS = [
  'product_id',
  'address',
  'name_ar',
  'name_en',
  'category',
  'extra_categories',
  'series',
  'summary_ar',
  'summary_en',
  'description_ar',
  'description_en',
  'visible',
  'variant_id',
  'code',
  'finish',
  'variant_name_ar',
  'variant_name_en',
] as const;
export type SheetColumn = (typeof SHEET_COLUMNS)[number];

const VARIANT_COLUMNS = [
  'variant_id',
  'code',
  'finish',
  'variant_name_ar',
  'variant_name_en',
] as const satisfies readonly SheetColumn[];
const isVariantColumn = (column: SheetColumn) =>
  (VARIANT_COLUMNS as readonly SheetColumn[]).includes(column);

/** Rows an import may have, and products per request to the API. */
export const MAX_SHEET_ROWS = 20_000;
export const IMPORT_BATCH = 100;

/* --------------------------------------- What is sent --------------------------------------- */

const partialText = (max: number) =>
  z.strictObject({ ar: z.string().max(max).optional(), en: z.string().max(max).optional() });

/** An attribute value from the sheet: text may give one language only; null clears it. */
const sheetValueSchema = z.union([
  z.strictObject({ text: partialText(200) }),
  z.strictObject({ number: z.number().finite().min(-1e9).max(1e9) }),
  z.strictObject({ choice: itemId }),
  z.strictObject({ yes: z.boolean() }),
]);
export type SheetValue = z.infer<typeof sheetValueSchema>;

export const sheetVariantSchema = z.strictObject({
  id: itemId.nullable(),
  sku: skuSchema.optional(),
  finishId: itemId.nullable().optional(),
  name: partialText(80),
});
export type SheetVariant = z.infer<typeof sheetVariantSchema>;

/** One product as read from the sheet: only what its columns say. */
export const sheetProductSchema = z.strictObject({
  /** The product it updates, or null for a new one (matched by address in the API too). */
  id: itemId.nullable(),
  slug: slugSchema.optional(),
  name: partialText(120),
  categoryId: itemId.optional(),
  extraCategoryIds: z.array(itemId).max(5).optional(),
  seriesId: itemId.nullable().optional(),
  summary: partialText(300),
  description: partialText(5000),
  visible: z.boolean().optional(),
  values: z
    .record(itemId, sheetValueSchema.nullable())
    .refine((v) => Object.keys(v).length <= 300)
    .optional(),
  /** Present when the file has variant columns: the product's whole list of variants. */
  variants: z.array(sheetVariantSchema).max(60).optional(),
});
export type SheetProduct = z.infer<typeof sheetProductSchema>;

export const sheetImportSchema = z.strictObject({
  items: z.array(sheetProductSchema).min(1).max(IMPORT_BATCH),
});

/* ------------------------------------------- Merge ------------------------------------------- */

export type MergeProblem = 'unknown-variant' | 'missing-category' | 'missing-address';

const mergeText = (before: Bilingual, patch: { ar?: string; en?: string }): Bilingual => ({
  ar: (patch.ar ?? before.ar).trim(),
  en: (patch.en ?? before.en).trim(),
});

/**
 * Applies one sheet product to the stored product (or a new one). The result still has to pass
 * `productSchema` and the reference checks, as any save does.
 */
export function mergeSheetProduct(
  existing: Product | null,
  item: SheetProduct,
  newId: () => string,
): { ok: true; product: Product } | { ok: false; problem: MergeProblem; detail?: string } {
  let base = existing;
  if (!base) {
    if (item.slug === undefined) return { ok: false, problem: 'missing-address' };
    if (item.categoryId === undefined) return { ok: false, problem: 'missing-category' };
    base = newProduct({ ar: '', en: '' }, item.slug, item.categoryId);
  }
  const product: Product = structuredClone(base);
  if (item.slug !== undefined) product.slug = item.slug;
  product.name = mergeText(product.name, item.name);
  product.summary = mergeText(product.summary, item.summary);
  product.description = mergeText(product.description, item.description);
  if (item.categoryId !== undefined) product.categoryId = item.categoryId;
  if (item.extraCategoryIds !== undefined) product.extraCategoryIds = item.extraCategoryIds;
  if (item.seriesId !== undefined) product.seriesId = item.seriesId;
  if (item.visible !== undefined) product.visible = item.visible;

  for (const [attributeId, value] of Object.entries(item.values ?? {})) {
    if (value === null) {
      delete product.values[attributeId];
      continue;
    }
    if ('text' in value) {
      const before = product.values[attributeId];
      const text = mergeText(
        before && 'text' in before ? before.text : { ar: '', en: '' },
        value.text,
      );
      if (text.ar === '' && text.en === '') delete product.values[attributeId];
      else product.values[attributeId] = { text };
    } else {
      product.values[attributeId] = value;
    }
  }

  if (item.variants !== undefined) {
    const unmatched = [...base.variants];
    const take = (match: (v: Product['variants'][number]) => boolean) => {
      const index = unmatched.findIndex(match);
      return index === -1 ? undefined : unmatched.splice(index, 1)[0];
    };
    const variants: Product['variants'] = [];
    for (const row of item.variants) {
      const sku = row.sku?.trim();
      let before;
      if (row.id !== null) {
        before = take((v) => v.id === row.id);
        if (!before) return { ok: false, problem: 'unknown-variant', detail: row.id };
      } else if (sku) {
        before = take((v) => v.sku.toLowerCase() === sku.toLowerCase());
      }
      variants.push({
        id: before?.id ?? newId(),
        sku: sku ?? before?.sku ?? '',
        finishId: row.finishId !== undefined ? row.finishId : (before?.finishId ?? null),
        name: mergeText(before?.name ?? { ar: '', en: '' }, row.name),
        images: before?.images ?? [],
      });
    }
    product.variants = variants;
  }
  return { ok: true, product };
}

/* ------------------------------------------- Export ------------------------------------------- */

const cellText = (value: string) => value.replace(/\r\n?/g, '\n');

/** A spreadsheet column that holds an attribute value. */
interface AttributeColumn {
  attribute: Attribute;
  lang: Lang | null;
}

const attributeLabel = (attribute: Attribute) => {
  const name = attribute.name.en || attribute.name.ar || attribute.id;
  return attribute.unit ? `${name} (${attribute.unit})` : name;
};

function attributeColumns(catalogue: Catalogue): { header: string; column: AttributeColumn }[] {
  return catalogue.attributes.flatMap<{ header: string; column: AttributeColumn }>((attribute) =>
    attribute.type === 'text'
      ? LANGS.map((lang) => ({
          header: `${attributeLabel(attribute)} [${attribute.id}:${lang}]`,
          column: { attribute, lang },
        }))
      : [
          {
            header: `${attributeLabel(attribute)} [${attribute.id}]`,
            column: { attribute, lang: null },
          },
        ],
  );
}

const yesNo = (value: boolean) => (value ? 'yes' : 'no');
const labelOf = (text: Bilingual) => text.en || text.ar;

export interface SheetTable {
  rows: string[][];
  /** Columns whose cells are numbers (Excel files store them as numbers). */
  numeric: boolean[];
}

/** The whole catalogue as a table: a header row, then one row per variant (or product). */
export function catalogueToSheet(
  catalogue: Catalogue,
  products: ReadonlyMap<string, Product>,
): SheetTable {
  const categories = new Map(catalogue.categories.map((c) => [c.id, c.slug]));
  const series = new Map(catalogue.series.map((x) => [x.id, x.slug]));
  const finishes = new Map(catalogue.finishes.map((f) => [f.id, labelOf(f.name) || f.id]));
  const extra = attributeColumns(catalogue);
  const header = [...SHEET_COLUMNS, ...extra.map((x) => x.header)];
  const numeric = header.map((_, i) => {
    const column = extra[i - SHEET_COLUMNS.length]?.column;
    return column?.attribute.type === 'number';
  });

  const rows: string[][] = [header];
  for (const id of catalogue.products) {
    const product = products.get(id);
    if (!product) continue;
    const valueCells = extra.map(({ column: { attribute, lang } }) => {
      const value = product.values[attribute.id];
      if (!value) return '';
      if ('text' in value) return lang ? value.text[lang] : '';
      if ('number' in value) return String(value.number);
      if ('yes' in value) return yesNo(value.yes);
      const choice = attribute.choices.find((c) => c.id === value.choice);
      return choice ? labelOf(choice.label) || choice.id : '';
    });
    const productCells: Record<Exclude<SheetColumn, (typeof VARIANT_COLUMNS)[number]>, string> = {
      product_id: id,
      address: product.slug,
      name_ar: product.name.ar,
      name_en: product.name.en,
      category: categories.get(product.categoryId) ?? '',
      extra_categories: product.extraCategoryIds
        .map((x) => categories.get(x))
        .filter((x) => x !== undefined)
        .join(', '),
      series: product.seriesId ? (series.get(product.seriesId) ?? '') : '',
      summary_ar: product.summary.ar,
      summary_en: product.summary.en,
      description_ar: product.description.ar,
      description_en: product.description.en,
      visible: yesNo(product.visible),
    };
    const variants = product.variants.length > 0 ? product.variants : [null];
    for (const variant of variants) {
      const cells: Record<SheetColumn, string> = {
        ...productCells,
        variant_id: variant?.id ?? '',
        code: variant?.sku ?? '',
        finish: variant?.finishId ? (finishes.get(variant.finishId) ?? '') : '',
        variant_name_ar: variant?.name.ar ?? '',
        variant_name_en: variant?.name.en ?? '',
      };
      rows.push([...SHEET_COLUMNS.map((c) => cellText(cells[c])), ...valueCells.map(cellText)]);
    }
  }
  return { rows, numeric };
}

/* ------------------------------------------- Import ------------------------------------------- */

export type SheetErrorCode =
  | 'empty'
  | 'too-many-rows'
  | 'too-many-products'
  | 'unknown-column'
  | 'duplicate-column'
  | 'missing-column'
  | 'unknown-product'
  | 'unknown-variant'
  | 'missing-address'
  | 'invalid-address'
  | 'missing-category'
  | 'unknown-category'
  | 'unknown-series'
  | 'unknown-finish'
  | 'ambiguous-finish'
  | 'unknown-choice'
  | 'not-in-category'
  | 'invalid-number'
  | 'invalid-yes-no'
  | 'invalid-code'
  | 'conflicting-values'
  | 'invalid';

export interface SheetError {
  /** The row as numbered in the spreadsheet (the header is row 1). */
  row: number;
  /** The column's header, when one cell is the problem. */
  column?: string;
  code: SheetErrorCode;
  detail?: string;
}

export interface SheetChange {
  /** The product it updates, or null for a new one. */
  id: string | null;
  item: SheetProduct;
  /** The product as it would be saved. */
  product: Product;
  status: 'new' | 'changed' | 'unchanged';
  rows: number[];
}

export interface SheetReading {
  changes: SheetChange[];
  errors: SheetError[];
}

/** Digits and the decimal mark as Arabic text may write them, read as plain digits. */
const westernDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.');

export function readNumber(cell: string): number | null {
  const text = westernDigits(cell.trim()).replace(/\s/g, '');
  if (!/^-?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return null;
  const number = Number(text.replace(',', '.'));
  return Number.isFinite(number) && Math.abs(number) <= 1e9 ? number : null;
}

export function readYesNo(cell: string): boolean | null {
  const text = cell.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'نعم'].includes(text)) return true;
  if (['no', 'n', 'false', '0', 'لا'].includes(text)) return false;
  return null;
}

const fold = (value: string) => value.trim().toLowerCase();

/** Finds an item by its id or by its name in either language; `null` when several match. */
function byName<T extends { id: string }>(
  items: readonly T[],
  name: (item: T) => Bilingual,
  cell: string,
): T | null | undefined {
  const key = fold(cell);
  const byId = items.find((x) => x.id === cell.trim());
  if (byId) return byId;
  const found = items.filter((x) => fold(name(x).en) === key || fold(name(x).ar) === key);
  return found.length > 1 ? null : found[0];
}

/** Reads a header cell: a fixed column, or an attribute (`… [id]` / `… [id:ar]`). */
function readHeader(
  cell: string,
  attributes: ReadonlyMap<string, Attribute>,
): { kind: 'fixed'; column: SheetColumn } | { kind: 'attribute'; column: AttributeColumn } | null {
  const text = cell.trim();
  if ((SHEET_COLUMNS as readonly string[]).includes(text.toLowerCase())) {
    return { kind: 'fixed', column: text.toLowerCase() as SheetColumn };
  }
  const match = /\[([a-z0-9]{6,24})(?::(ar|en))?\]\s*$/.exec(text);
  const attribute = match ? attributes.get(match[1] as string) : undefined;
  if (!match || !attribute) return null;
  const lang = (match[2] as Lang | undefined) ?? null;
  if ((attribute.type === 'text') !== (lang !== null)) return null;
  return { kind: 'attribute', column: { attribute, lang } };
}

/**
 * Reads a table (the first row is the header) into the products it would create or change,
 * checking every cell. `products` are the current draft products, by id.
 */
export function readSheet(
  table: readonly (readonly string[])[],
  catalogue: Catalogue,
  products: ReadonlyMap<string, Product>,
  newId: () => string,
): SheetReading {
  const errors: SheetError[] = [];
  /** Spreadsheet row numbers of the rows with something in them. */
  const filledRows: number[] = [];
  table.forEach((row, i) => {
    if (i > 0 && row.some((cell) => cell.trim() !== '')) filledRows.push(i + 1);
  });
  const headerRow = table[0];
  if (!headerRow || filledRows.length === 0) {
    return { changes: [], errors: [{ row: 1, code: 'empty' }] };
  }
  if (table.length - 1 > MAX_SHEET_ROWS) {
    return { changes: [], errors: [{ row: MAX_SHEET_ROWS + 2, code: 'too-many-rows' }] };
  }

  const attributes = new Map(catalogue.attributes.map((a) => [a.id, a]));
  const fixed = new Map<SheetColumn, number>();
  const valueColumns: { index: number; header: string; column: AttributeColumn }[] = [];
  const seen = new Set<string>();
  headerRow.forEach((cell, index) => {
    if (cell.trim() === '') return;
    const header = readHeader(cell, attributes);
    if (!header) {
      errors.push({ row: 1, column: cell, code: 'unknown-column' });
      return;
    }
    const key =
      header.kind === 'fixed'
        ? header.column
        : `${header.column.attribute.id}:${header.column.lang ?? ''}`;
    if (seen.has(key)) errors.push({ row: 1, column: cell, code: 'duplicate-column' });
    seen.add(key);
    if (header.kind === 'fixed') fixed.set(header.column, index);
    else valueColumns.push({ index, header: cell.trim(), column: header.column });
  });
  if (!fixed.has('product_id') && !fixed.has('address')) {
    errors.push({ row: 1, code: 'missing-column', detail: 'address' });
  }
  if (errors.length > 0) return { changes: [], errors };

  /* Rows grouped by product: the id when given, otherwise the address. */
  const bySlug = new Map([...products].map(([id, p]) => [p.slug, id]));
  const cell = (row: readonly string[], column: SheetColumn) => {
    const index = fixed.get(column);
    return index === undefined ? undefined : unguard(row[index] ?? '').trim();
  };
  const groups = new Map<string, { id: string | null; rows: number[] }>();
  for (const number of filledRows) {
    const row = table[number - 1] as readonly string[];
    const id = cell(row, 'product_id') ?? '';
    const slug = cell(row, 'address') ?? '';
    if (id !== '') {
      if (!products.has(id)) {
        errors.push({ row: number, column: 'product_id', code: 'unknown-product', detail: id });
        continue;
      }
    } else if (slug === '') {
      errors.push({ row: number, column: 'address', code: 'missing-address' });
      continue;
    } else if (!slugSchema.safeParse(slug).success) {
      errors.push({ row: number, column: 'address', code: 'invalid-address', detail: slug });
      continue;
    }
    const known = id !== '' ? id : bySlug.get(slug);
    const key = known ? `id:${known}` : `new:${slug}`;
    const group = groups.get(key) ?? { id: known ?? null, rows: [] };
    group.rows.push(number);
    groups.set(key, group);
  }
  const fresh = [...groups.values()].filter((g) => g.id === null).length;
  if (catalogue.products.length + fresh > MAX_PRODUCTS) {
    errors.push({ row: 1, code: 'too-many-products', detail: String(MAX_PRODUCTS) });
  }

  const categoryBySlug = new Map(catalogue.categories.map((c) => [c.slug, c.id]));
  const seriesBySlug = new Map(catalogue.series.map((x) => [x.slug, x.id]));
  const hasVariants = VARIANT_COLUMNS.some((c) => fixed.has(c));
  const changes: SheetChange[] = [];

  for (const group of groups.values()) {
    const first = table[(group.rows[0] as number) - 1] as readonly string[];
    const fail = (row: number, column: string | undefined, code: SheetErrorCode, detail?: string) =>
      errors.push({ row, ...(column ? { column } : {}), code, ...(detail ? { detail } : {}) });
    const before = errors.length;

    // Product columns may be repeated on each variant row, or left empty after the first.
    const productColumns = SHEET_COLUMNS.filter((c) => !isVariantColumn(c));
    for (const number of group.rows.slice(1)) {
      const row = table[number - 1] as readonly string[];
      for (const column of productColumns) {
        const value = cell(row, column);
        if (value !== undefined && value !== '' && value !== cell(first, column)) {
          fail(number, column, 'conflicting-values');
        }
      }
      for (const { index, header } of valueColumns) {
        const value = unguard(row[index] ?? '').trim();
        if (value !== '' && value !== unguard(first[index] ?? '').trim()) {
          fail(number, header, 'conflicting-values');
        }
      }
    }

    const row = group.rows[0] as number;
    const item: SheetProduct = { id: group.id, name: {}, summary: {}, description: {} };
    const slug = cell(first, 'address');
    if (slug !== undefined && slug !== '') {
      if (slugSchema.safeParse(slug).success) item.slug = slug;
      else fail(row, 'address', 'invalid-address', slug);
    }
    for (const lang of LANGS) {
      const name = cell(first, `name_${lang}`);
      const summary = cell(first, `summary_${lang}`);
      const description = cell(first, `description_${lang}`);
      if (name !== undefined) item.name[lang] = name;
      if (summary !== undefined) item.summary[lang] = summary;
      if (description !== undefined) item.description[lang] = description;
    }
    const category = cell(first, 'category');
    if (category !== undefined) {
      const id = categoryBySlug.get(category);
      if (category === '') fail(row, 'category', 'missing-category');
      else if (!id) fail(row, 'category', 'unknown-category', category);
      else item.categoryId = id;
    } else if (group.id === null) {
      fail(row, undefined, 'missing-category');
    }
    const extra = cell(first, 'extra_categories');
    if (extra !== undefined) {
      const ids: string[] = [];
      for (const part of extra.split(/[,،;]/).map((x) => x.trim())) {
        if (part === '') continue;
        const id = categoryBySlug.get(part);
        if (!id) fail(row, 'extra_categories', 'unknown-category', part);
        else if (!ids.includes(id)) ids.push(id);
      }
      item.extraCategoryIds = ids;
    }
    const series = cell(first, 'series');
    if (series !== undefined) {
      const id = seriesBySlug.get(series);
      if (series !== '' && !id) fail(row, 'series', 'unknown-series', series);
      else item.seriesId = id ?? null;
    }
    const visible = cell(first, 'visible');
    if (visible !== undefined && visible !== '') {
      const yes = readYesNo(visible);
      if (yes === null) fail(row, 'visible', 'invalid-yes-no', visible);
      else item.visible = yes;
    }

    // Attribute values, read against the categories the product will have.
    const existing = group.id ? (products.get(group.id) ?? null) : null;
    const categoryIds = [
      item.categoryId ?? existing?.categoryId,
      ...(item.extraCategoryIds ?? existing?.extraCategoryIds ?? []),
    ].filter((x) => x !== undefined);
    const allowed = new Set(
      productAttributes(catalogue, {
        ...(existing ?? newProduct({ ar: '', en: '' }, 'x', '')),
        categoryId: categoryIds[0] ?? '',
        extraCategoryIds: categoryIds.slice(1),
      }).map((a) => a.id),
    );
    const values: NonNullable<SheetProduct['values']> = {};
    for (const { index, header, column } of valueColumns) {
      const { attribute, lang } = column;
      const text = unguard(first[index] ?? '').trim();
      if (text !== '' && !allowed.has(attribute.id)) {
        fail(row, header, 'not-in-category');
        continue;
      }
      if (attribute.type === 'text' && lang) {
        const previous = values[attribute.id];
        const parts = previous && 'text' in previous ? previous.text : {};
        values[attribute.id] = { text: { ...parts, [lang]: text } };
        continue;
      }
      if (text === '') {
        values[attribute.id] = null;
        continue;
      }
      let value: AttributeValue | undefined;
      if (attribute.type === 'number') {
        const number = readNumber(text);
        if (number === null) fail(row, header, 'invalid-number', text);
        else value = { number };
      } else if (attribute.type === 'yes-no') {
        const yes = readYesNo(text);
        if (yes === null) fail(row, header, 'invalid-yes-no', text);
        else value = { yes };
      } else {
        const choice = byName(attribute.choices, (c) => c.label, text);
        if (!choice) fail(row, header, 'unknown-choice', text);
        else value = { choice: choice.id };
      }
      if (value) values[attribute.id] = value;
    }
    if (valueColumns.length > 0) item.values = values;

    if (hasVariants) {
      item.variants = [];
      for (const number of group.rows) {
        const vrow = table[number - 1] as readonly string[];
        const id = cell(vrow, 'variant_id') ?? '';
        const sku = cell(vrow, 'code');
        const finish = cell(vrow, 'finish');
        const nameAr = cell(vrow, 'variant_name_ar');
        const nameEn = cell(vrow, 'variant_name_en');
        if (id === '' && !sku && !finish && !nameAr && !nameEn) continue;
        const variant: SheetVariant = { id: null, name: {} };
        if (id !== '') {
          if (!existing?.variants.some((v) => v.id === id)) {
            fail(number, 'variant_id', 'unknown-variant', id);
            continue;
          }
          variant.id = id;
        }
        if (sku !== undefined) {
          if (skuSchema.safeParse(sku).success) variant.sku = sku;
          else fail(number, 'code', 'invalid-code', sku);
        }
        if (finish !== undefined) {
          if (finish === '') variant.finishId = null;
          else {
            const found = byName(catalogue.finishes, (f) => f.name, finish);
            if (found === null) fail(number, 'finish', 'ambiguous-finish', finish);
            else if (!found) fail(number, 'finish', 'unknown-finish', finish);
            else variant.finishId = found.id;
          }
        }
        if (nameAr !== undefined) variant.name.ar = nameAr;
        if (nameEn !== undefined) variant.name.en = nameEn;
        item.variants.push(variant);
      }
    }

    if (errors.length > before) continue;
    const merged = mergeSheetProduct(existing, item, newId);
    if (!merged.ok) {
      fail(row, undefined, merged.problem, merged.detail);
      continue;
    }
    const parsed = productSchema.safeParse(merged.product);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 5)) {
        fail(row, columnOf(issue.path, valueColumns), 'invalid', issue.message);
      }
      continue;
    }
    const status = !existing ? 'new' : sameJson(existing, parsed.data) ? 'unchanged' : 'changed';
    changes.push({ id: group.id, item, product: parsed.data, status, rows: group.rows });
  }
  return { changes, errors };
}

/** The column a schema problem points at, as far as it can be told. */
function columnOf(
  path: readonly PropertyKey[],
  valueColumns: readonly { header: string; column: AttributeColumn }[],
): string | undefined {
  const [field, key, , part] = path.map(String);
  if (field === 'values') return valueColumns.find((c) => c.column.attribute.id === key)?.header;
  if (field === 'variants') return part === 'name' ? 'variant_name_en' : 'code';
  if (field === 'name' || field === 'summary' || field === 'description') {
    return `${field}_${key === 'ar' ? 'ar' : 'en'}`;
  }
  if (field === 'slug') return 'address';
  return undefined;
}

/** Key order doesn't matter: data read back from the database has its keys sorted. */
function sameJson(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
          )
        : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/* --------------------------------------------- CSV --------------------------------------------- */

/** A cell spreadsheet programs could run as a formula gets a leading `'`, removed on import. */
const RISKY = /^[=+\-@\t\r]/;
const guard = (value: string) =>
  RISKY.test(value) && readNumber(value) === null ? `'${value}` : value;
export const unguard = (value: string) =>
  value.startsWith("'") && RISKY.test(value.slice(1)) ? value.slice(1) : value;

/** CSV text (UTF-8 with a byte order mark, so spreadsheet programs read Arabic correctly). */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const line = (row: readonly string[]) =>
    row.map((value) => `"${guard(value).replace(/"/g, '""')}"`).join(',');
  return `\uFEFF${rows.map(line).join('\r\n')}\r\n`;
}

/**
 * Reads CSV text as written by spreadsheet programs: quoted cells with doubled quotes and line
 * breaks, and a comma, semicolon or tab between cells (whichever the header row uses).
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const headerEnd = text.search(/\r?\n/);
  const firstLine = (headerEnd === -1 ? text : text.slice(0, headerEnd)).replace(/"[^"]*"/g, '');
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const);
  const delimiter = counts.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        value += ch;
      }
    } else if (ch === '"' && value === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(value);
      value = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += ch;
    }
  }
  if (value !== '' || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows.map((r) => r.map((cell) => cell.replace(/\r\n?/g, '\n')));
}
