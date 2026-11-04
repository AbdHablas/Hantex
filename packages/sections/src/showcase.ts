import { z } from 'zod';
import {
  MAX_PRODUCTS,
  attributeGroupSchema,
  attributeSchema,
  attributeValueSchema,
  finishSchema,
  skuSchema,
  valueFits,
  type Attribute,
  type AttributeValue,
  type Catalogue,
  type Product,
} from './catalogue';
import { bilingual, itemId, slugSchema, type Bilingual, type Link } from './primitives';
import type { ContentSection, SectionOf } from './registry';

/**
 * The public part of a website's catalogue (D-048): what its pages may show. Only visible
 * products, in display order, and only what the product sections and catalogue links use; never
 * hidden products, drafts, documents or certificate details. Built from the published catalogue
 * for the site's build, and from the drafts for previews.
 */
const imageRef = z.strictObject({ mediaId: z.uuid() }).nullable();

const showcaseProductSchema = z.strictObject({
  id: itemId,
  name: bilingual(120),
  slug: slugSchema,
  /** The primary category first, then the extra ones. */
  categoryIds: z.array(itemId).min(1).max(6),
  seriesId: itemId.nullable(),
  summary: bilingual(300),
  /** The product's first photo, or else its first variant's. */
  image: imageRef,
  /** Finishes of its variants, each once, in variant order. */
  finishIds: z.array(itemId).max(60),
  variants: z
    .array(z.strictObject({ sku: skuSchema, finishId: itemId.nullable(), name: bilingual(80) }))
    .max(60),
  /** Only values that fit their attribute. */
  values: z.record(itemId, attributeValueSchema),
});
export type ShowcaseProduct = z.infer<typeof showcaseProductSchema>;

/** The showcase as data, re-validated when a preview receives it. */
export const showcaseSchema = z.strictObject({
  categories: z
    .array(
      z.strictObject({
        id: itemId,
        name: bilingual(80),
        slug: slugSchema,
        parentId: itemId.nullable(),
        main: z.boolean(),
        description: bilingual(500),
        image: imageRef,
      }),
    )
    .max(300),
  series: z
    .array(
      z.strictObject({
        id: itemId,
        name: bilingual(80),
        slug: slugSchema,
        description: bilingual(1000),
        image: imageRef,
      }),
    )
    .max(200),
  finishes: z
    .array(z.strictObject({ id: itemId, name: bilingual(60), swatch: finishSchema.shape.swatch }))
    .max(300),
  groups: z.array(attributeGroupSchema).max(30),
  attributes: z.array(attributeSchema).max(300),
  products: z.array(showcaseProductSchema).max(MAX_PRODUCTS),
});
export type Showcase = z.infer<typeof showcaseSchema>;

export const EMPTY_SHOWCASE: Showcase = {
  categories: [],
  series: [],
  finishes: [],
  groups: [],
  attributes: [],
  products: [],
};

/** The showcase of a catalogue: its structure and its visible products. */
export function showcaseOf(catalogue: Catalogue, products: Map<string, Product>): Showcase {
  const attributes = new Map(catalogue.attributes.map((a) => [a.id, a]));
  const finishes = new Set(catalogue.finishes.map((f) => f.id));
  const seen = new Set<string>();
  const list: ShowcaseProduct[] = [];
  for (const id of catalogue.products) {
    const product = products.get(id);
    if (!product?.visible || seen.has(id)) continue;
    seen.add(id);
    const values: Record<string, AttributeValue> = {};
    for (const [attributeId, value] of Object.entries(product.values)) {
      const attribute = attributes.get(attributeId);
      if (attribute && valueFits(attribute, value)) values[attributeId] = value;
    }
    const finishIds = [
      ...new Set(
        product.variants.flatMap((v) =>
          v.finishId && finishes.has(v.finishId) ? [v.finishId] : [],
        ),
      ),
    ];
    list.push({
      id,
      name: product.name,
      slug: product.slug,
      categoryIds: [product.categoryId, ...product.extraCategoryIds],
      seriesId: product.seriesId,
      summary: product.summary,
      image: product.images[0] ?? product.variants.find((v) => v.images[0])?.images[0] ?? null,
      finishIds,
      variants: product.variants.map((v) => ({ sku: v.sku, finishId: v.finishId, name: v.name })),
      values,
    });
  }
  return {
    categories: catalogue.categories.map(
      ({ id, name, slug, parentId, main, description, image }) => ({
        id,
        name,
        slug,
        parentId,
        main,
        description,
        image,
      }),
    ),
    series: catalogue.series.map(({ id, name, slug, description, image }) => ({
      id,
      name,
      slug,
      description,
      image,
    })),
    finishes: catalogue.finishes.map(({ id, name, swatch }) => ({ id, name, swatch })),
    groups: catalogue.groups,
    attributes: catalogue.attributes,
    products: list,
  };
}

/* ---------------------------------------- What sections show ---------------------------------------- */

/** A category and every category below it. */
export function categoryAndBelow(showcase: Showcase, categoryId: string): Set<string> {
  const ids = new Set([categoryId]);
  // Three levels at most (D-026), so two passes find every descendant.
  for (let pass = 0; pass < 3; pass++) {
    for (const c of showcase.categories) {
      if (c.parentId && ids.has(c.parentId)) ids.add(c.id);
    }
  }
  return ids;
}

/** The products a products section shows, in catalogue order (picked ones in the order picked). */
export function productsFor(
  showcase: Showcase,
  settings: SectionOf<'products'>['settings'],
): ShowcaseProduct[] {
  const byId = new Map(showcase.products.map((p) => [p.id, p]));
  switch (settings.source) {
    case 'picked':
      return [...new Set(settings.productIds)].flatMap((id) => byId.get(id) ?? []).slice(0, 24);
    case 'all':
      return showcase.products.slice(0, settings.limit);
    case 'category': {
      if (!settings.categoryId) return [];
      const ids = settings.includeSubcategories
        ? categoryAndBelow(showcase, settings.categoryId)
        : new Set([settings.categoryId]);
      return showcase.products
        .filter((p) => p.categoryIds.some((c) => ids.has(c)))
        .slice(0, settings.limit);
    }
    case 'series':
      return settings.seriesId
        ? showcase.products.filter((p) => p.seriesId === settings.seriesId).slice(0, settings.limit)
        : [];
  }
}

export type Collection =
  | { type: 'category'; item: Showcase['categories'][number] }
  | { type: 'series'; item: Showcase['series'][number] };

/** The categories or series a collections section shows. */
export function collectionsFor(
  showcase: Showcase,
  settings: SectionOf<'collections'>['settings'],
): Collection[] {
  switch (settings.source) {
    case 'main':
      return showcase.categories
        .filter((c) => c.main && c.parentId === null)
        .map((item) => ({ type: 'category', item }));
    case 'subcategories':
      return settings.categoryId
        ? showcase.categories
            .filter((c) => c.parentId === settings.categoryId)
            .map((item) => ({ type: 'category', item }))
        : [];
    case 'series': {
      if (settings.seriesIds.length === 0) {
        return showcase.series.map((item) => ({ type: 'series', item }));
      }
      const byId = new Map(showcase.series.map((s) => [s.id, s]));
      return [...new Set(settings.seriesIds)].flatMap((id) => {
        const item = byId.get(id);
        return item ? [{ type: 'series' as const, item }] : [];
      });
    }
  }
}

/** The products a comparison table shows: those still visible, each once, at most four. */
export function compareProducts(
  showcase: Showcase,
  settings: SectionOf<'compare'>['settings'],
): ShowcaseProduct[] {
  const byId = new Map(showcase.products.map((p) => [p.id, p]));
  return [...new Set(settings.productIds)].flatMap((id) => byId.get(id) ?? []).slice(0, 4);
}

/* ----------------------------------------- Tables ----------------------------------------- */

export interface SpecGroup {
  /** null for attributes without a group. */
  name: Bilingual | null;
  attributes: Attribute[];
}

/** Attributes in their groups' order, then those without a group; only the ones given. */
export function groupAttributes(showcase: Showcase, attributeIds: Set<string>): SpecGroup[] {
  const groups: SpecGroup[] = showcase.groups.map((g) => ({
    name: g.name,
    attributes: showcase.attributes.filter((a) => a.groupId === g.id && attributeIds.has(a.id)),
  }));
  const known = new Set(showcase.groups.map((g) => g.id));
  groups.push({
    name: null,
    attributes: showcase.attributes.filter(
      (a) => (a.groupId === null || !known.has(a.groupId)) && attributeIds.has(a.id),
    ),
  });
  return groups.filter((g) => g.attributes.length > 0);
}

/** A product's specification table: every attribute it has a value for, grouped. */
export function specGroups(showcase: Showcase, product: ShowcaseProduct): SpecGroup[] {
  return groupAttributes(showcase, new Set(Object.keys(product.values)));
}

/**
 * The rows of a comparison: attributes at least one product has a value for, and with
 * `onlyDifferences`, only those where the values are not all the same.
 */
export function compareGroups(
  showcase: Showcase,
  products: ShowcaseProduct[],
  onlyDifferences: boolean,
): SpecGroup[] {
  const ids = new Set(products.flatMap((p) => Object.keys(p.values)));
  if (onlyDifferences) {
    for (const id of [...ids]) {
      const first = JSON.stringify(products[0]?.values[id] ?? null);
      if (products.every((p) => JSON.stringify(p.values[id] ?? null) === first)) ids.delete(id);
    }
  }
  return groupAttributes(showcase, ids);
}

/** How a value reads in one language: text, a number with its unit, a choice, yes or no. */
export function formatValue(
  attribute: Attribute,
  value: AttributeValue | undefined,
  locale: 'ar' | 'en',
  words: { yes: string; no: string },
): string {
  if (!value) return '';
  if ('text' in value) return value.text[locale].trim();
  if ('number' in value) {
    // Latin digits in both languages, as on the packaging and in datasheets.
    const n = new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
      maximumFractionDigits: 6,
    }).format(value.number);
    return attribute.unit ? `${n} ${attribute.unit}` : n;
  }
  if ('choice' in value) {
    return attribute.choices.find((c) => c.id === value.choice)?.label[locale].trim() ?? '';
  }
  return value.yes ? words.yes : words.no;
}

/* --------------------------------------- References and checks --------------------------------------- */

/** The catalogue items a link or section names. */
export interface CatalogueRefs {
  products: string[];
  categories: string[];
  series: string[];
}

/** The catalogue items one section names explicitly (not those it finds, like "all products"). */
export function sectionCatalogueRefs(section: ContentSection): CatalogueRefs {
  const refs: CatalogueRefs = { products: [], categories: [], series: [] };
  switch (section.type) {
    case 'products': {
      const s = section.settings;
      if (s.source === 'category' && s.categoryId) refs.categories.push(s.categoryId);
      if (s.source === 'series' && s.seriesId) refs.series.push(s.seriesId);
      if (s.source === 'picked') refs.products.push(...s.productIds);
      break;
    }
    case 'collections': {
      const s = section.settings;
      if (s.source === 'subcategories' && s.categoryId) refs.categories.push(s.categoryId);
      if (s.source === 'series') refs.series.push(...s.seriesIds);
      break;
    }
    case 'specs':
      if (section.settings.productId) refs.products.push(section.settings.productId);
      break;
    case 'compare':
      refs.products.push(...section.settings.productIds);
      break;
  }
  return refs;
}

/**
 * What a section still needs before it can go public: a category or series to show, products
 * picked, or (for a comparison) at least two products. Empty when it is complete.
 */
export function sectionIncomplete(section: ContentSection): string | null {
  switch (section.type) {
    case 'products': {
      const s = section.settings;
      if (s.source === 'category' && !s.categoryId) return 'category';
      if (s.source === 'series' && !s.seriesId) return 'series';
      if (s.source === 'picked' && s.productIds.length === 0) return 'products';
      return null;
    }
    case 'collections':
      return section.settings.source === 'subcategories' && !section.settings.categoryId
        ? 'category'
        : null;
    case 'specs':
      return section.settings.productId ? null : 'product';
    case 'compare':
      return new Set(section.settings.productIds).size < 2 ? 'products' : null;
    default:
      return null;
  }
}

/** The ids a site's pages may name: visible products, categories and series. */
export interface CatalogueIds {
  products: ReadonlySet<string>;
  categories: ReadonlySet<string>;
  series: ReadonlySet<string>;
}

export const catalogueIdsOf = (showcase: Showcase): CatalogueIds => ({
  products: new Set(showcase.products.map((p) => p.id)),
  categories: new Set(showcase.categories.map((c) => c.id)),
  series: new Set(showcase.series.map((s) => s.id)),
});

/** Whether a catalogue link leads somewhere public; other links are not its concern. */
export function catalogueLinkLive(link: Link, ids: CatalogueIds): boolean {
  switch (link.type) {
    case 'product':
      return ids.products.has(link.productId);
    case 'category':
      return ids.categories.has(link.categoryId);
    case 'series':
      return ids.series.has(link.seriesId);
    default:
      return true;
  }
}

/**
 * A smaller showcase for one page's preview: the structure, and only the products its sections
 * show. Keeps the signed preview form small however large the catalogue is.
 */
export function showcaseForSections(
  showcase: Showcase,
  sections: ContentSection[],
  /** Products linked from menus, buttons and the like. */
  linked: Iterable<string> = [],
): Showcase {
  const keep = new Set<string>(linked);
  let descriptions = false;
  for (const section of sections) {
    if (section.type === 'collections' && section.settings.showDescription) descriptions = true;
    if (section.type === 'products') {
      for (const p of productsFor(showcase, section.settings)) keep.add(p.id);
    } else if (section.type === 'specs' || section.type === 'compare') {
      for (const id of sectionCatalogueRefs(section).products) keep.add(id);
    }
  }
  const products = showcase.products.filter((p) => keep.has(p.id));
  const used = new Set(products.flatMap((p) => Object.keys(p.values)));
  const finishes = new Set(
    products.flatMap((p) => [...p.finishIds, ...p.variants.map((v) => v.finishId)]),
  );
  const blank = { ar: '', en: '' };
  return {
    categories: showcase.categories.map((c) => (descriptions ? c : { ...c, description: blank })),
    series: showcase.series.map((x) => (descriptions ? x : { ...x, description: blank })),
    finishes: showcase.finishes.filter((f) => finishes.has(f.id)),
    groups: showcase.groups,
    attributes: showcase.attributes.filter((a) => used.has(a.id)),
    products,
  };
}
