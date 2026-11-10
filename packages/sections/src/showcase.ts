import { z } from 'zod';
import {
  MAX_PRODUCTS,
  attributeGroupSchema,
  attributeSchema,
  attributeValueSchema,
  catalogueRedirectSchema,
  certificateSchema,
  featureSchema,
  MAX_FEATURES,
  MAX_REDIRECTS,
  finishSchema,
  isCertified,
  skuSchema,
  valueFits,
  type Attribute,
  type AttributeValue,
  type Catalogue,
  type CatalogueRedirect,
  type DocumentRef,
  type Product,
} from './catalogue';
import {
  DEFAULT_PRODUCT_MODELS,
  modelsShown,
  productModelSchema,
  type ProductModels,
} from './models';
import { bilingual, itemId, slugSchema, type Bilingual, type Link } from './primitives';
import type { ContentSection, SectionOf } from './registry';

/**
 * The public part of a website's catalogue (D-048): what its pages may show. Only visible
 * products, in display order, and what the product sections and catalogue pages show; never
 * hidden products or drafts (except in previews), and a certificate only once it has been checked
 * and is still valid (D-045). Built from the published catalogue for the site's build, and from
 * the drafts for previews.
 */
const imageRef = z.strictObject({ mediaId: z.uuid() }).nullable();
const image = z.strictObject({ mediaId: z.uuid() });

/**
 * A downloadable PDF. Certificates are listed only when verified and valid on the build day, and
 * then carry what the certificate says; other documents never carry certificate details.
 */
const publicDocumentSchema = z.strictObject({
  id: itemId,
  fileId: z.uuid(),
  type: z.enum(['datasheet', 'installation', 'manual', 'certificate', 'declaration', 'other']),
  title: bilingual(120),
  certificate: certificateSchema.nullable(),
});
export type PublicDocument = z.infer<typeof publicDocumentSchema>;
const documentList = z.array(publicDocumentSchema).max(20);

const showcaseProductSchema = z.strictObject({
  id: itemId,
  name: bilingual(120),
  slug: slugSchema,
  /** The primary category first, then the extra ones. */
  categoryIds: z.array(itemId).min(1).max(6),
  seriesId: itemId.nullable(),
  summary: bilingual(300),
  /** Plain paragraphs separated by blank lines. */
  description: bilingual(5000),
  /** The product's first photo, or else its first variant's. */
  image: imageRef,
  /** Every photo of the product. */
  images: z.array(image).max(20),
  /** Finishes of its variants, each once, in variant order. */
  finishIds: z.array(itemId).max(60),
  variants: z
    .array(
      z.strictObject({
        sku: skuSchema,
        finishId: itemId.nullable(),
        name: bilingual(80),
        images: z.array(image).max(12),
      }),
    )
    .max(60),
  documents: documentList,
  /** Only values that fit their attribute. */
  values: z.record(itemId, attributeValueSchema),
  /** Its published 3D models, one per finish, in finish order (D-057, D-058). */
  models: z.array(productModelSchema).max(60),
  /** Its features, in the team's order (D-059). */
  features: z.array(featureSchema).max(MAX_FEATURES),
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
        finishIds: z.array(itemId).max(60),
        documents: documentList,
      }),
    )
    .max(200),
  finishes: z
    .array(z.strictObject({ id: itemId, name: bilingual(60), swatch: finishSchema.shape.swatch }))
    .max(300),
  groups: z.array(attributeGroupSchema).max(30),
  attributes: z.array(attributeSchema).max(300),
  products: z.array(showcaseProductSchema).max(MAX_PRODUCTS),
  /** Old catalogue addresses that lead to current ones (D-050). */
  redirects: z.array(catalogueRedirectSchema).max(MAX_REDIRECTS),
});
export type Showcase = z.infer<typeof showcaseSchema>;

export const EMPTY_SHOWCASE: Showcase = {
  categories: [],
  series: [],
  finishes: [],
  groups: [],
  attributes: [],
  products: [],
  redirects: [],
};

/** Documents a website may offer: certificates only when checked and valid on `today`. */
export function publicDocuments(documents: DocumentRef[], today: string): PublicDocument[] {
  return documents.flatMap<PublicDocument>((doc) => {
    if (doc.type === 'certificate') {
      return isCertified(doc, today)
        ? [
            {
              id: doc.id,
              fileId: doc.fileId,
              type: doc.type,
              title: doc.title,
              certificate: doc.certificate,
            },
          ]
        : [];
    }
    return [
      { id: doc.id, fileId: doc.fileId, type: doc.type, title: doc.title, certificate: null },
    ];
  });
}

/** Today's date (YYYY-MM-DD, UTC), which decides whether a certificate is still valid. */
export const todayUtc = () => new Date().toISOString().slice(0, 10);

/** The showcase of a catalogue: its structure and its visible products. */
export function showcaseOf(
  catalogue: Catalogue,
  products: Map<string, Product>,
  models: ProductModels = DEFAULT_PRODUCT_MODELS,
  today: string = todayUtc(),
): Showcase {
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
      description: product.description,
      image: product.images[0] ?? product.variants.find((v) => v.images[0])?.images[0] ?? null,
      images: product.images,
      finishIds,
      variants: product.variants.map((v) => ({
        sku: v.sku,
        finishId: v.finishId && finishes.has(v.finishId) ? v.finishId : null,
        name: v.name,
        images: v.images,
      })),
      documents: publicDocuments(product.documents, today),
      values,
      models: modelsShown(models.products[id] ?? [], finishIds),
      features: product.features,
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
    series: catalogue.series.map(
      ({ id, name, slug, description, image, finishIds, documents }) => ({
        id,
        name,
        slug,
        finishIds: finishIds.filter((f) => finishes.has(f)),
        documents: publicDocuments(documents, today),
        description,
        image,
      }),
    ),
    finishes: catalogue.finishes.map(({ id, name, swatch }) => ({ id, name, swatch })),
    groups: catalogue.groups,
    attributes: catalogue.attributes,
    products: list,
    redirects: catalogue.redirects,
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
    case 'enquiry':
      if (section.settings.productId) refs.products.push(section.settings.productId);
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
    } else if (
      section.type === 'specs' ||
      section.type === 'compare' ||
      section.type === 'enquiry'
    ) {
      for (const id of sectionCatalogueRefs(section).products) keep.add(id);
    }
  }
  // Sections draw no descriptions, gallery photos or documents of products: left out to keep the
  // signed form small.
  const products = showcase.products
    .filter((p) => keep.has(p.id))
    .map((p) => ({
      ...p,
      description: { ar: '', en: '' },
      images: [],
      variants: p.variants.map((v) => ({ ...v, images: [] })),
      documents: [],
    }));
  const used = new Set(products.flatMap((p) => Object.keys(p.values)));
  const finishes = new Set(
    products.flatMap((p) => [...p.finishIds, ...p.variants.map((v) => v.finishId)]),
  );
  const blank = { ar: '', en: '' };
  return {
    categories: showcase.categories.map((c) => (descriptions ? c : { ...c, description: blank })),
    series: showcase.series.map((x) => ({
      ...x,
      description: descriptions ? x.description : blank,
      documents: [],
    })),
    finishes: showcase.finishes.filter((f) => finishes.has(f.id)),
    groups: showcase.groups,
    attributes: showcase.attributes.filter((a) => used.has(a.id)),
    products,
    redirects: [],
  };
}

/* ---------------------------------------- Catalogue pages ---------------------------------------- */

export type CataloguePageKind = 'product' | 'category' | 'series';

/** A catalogue page's address without the language prefix (D-048), e.g. "/product/one-gang". */
export const cataloguePath = (kind: CataloguePageKind, slug: string) => `/${kind}/${slug}`;

/** Every catalogue page a site builds: each visible product, each category and each series. */
export function cataloguePages(
  showcase: Showcase,
): { kind: CataloguePageKind; id: string; slug: string }[] {
  return [
    ...showcase.categories.map((c) => ({ kind: 'category' as const, id: c.id, slug: c.slug })),
    ...showcase.series.map((x) => ({ kind: 'series' as const, id: x.id, slug: x.slug })),
    ...showcase.products.map((p) => ({ kind: 'product' as const, id: p.id, slug: p.slug })),
  ];
}

/** A category and the categories above it, top first (for breadcrumbs). */
export function categoryTrail(showcase: Showcase, categoryId: string) {
  const byId = new Map(showcase.categories.map((c) => [c.id, c]));
  const trail: Showcase['categories'] = [];
  let current = byId.get(categoryId);
  while (current && trail.length < 3 && !trail.includes(current)) {
    trail.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return trail;
}

/** A category's products: its own and its sub-categories', in catalogue order. */
export const categoryProducts = (showcase: Showcase, categoryId: string) => {
  const ids = categoryAndBelow(showcase, categoryId);
  return showcase.products.filter((p) => p.categoryIds.some((c) => ids.has(c)));
};

/** Paragraphs of a plain description: separated by blank lines, single line breaks kept. */
export const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/* ---------------------------------------- Redirects ---------------------------------------- */

/** The public items of each kind, by id, with their current address. */
function addresses(showcase: Showcase) {
  return {
    product: new Map(showcase.products.map((p) => [p.id, p.slug])),
    category: new Map(showcase.categories.map((c) => [c.id, c.slug])),
    series: new Map(showcase.series.map((x) => [x.id, x.slug])),
  };
}

/**
 * The catalogue's redirects after publishing (D-050): the earlier ones, plus one for each public
 * product, category or series whose address changes. A redirect is dropped when its old address
 * is taken again by an item of the same kind, so a live page always wins. The newest are kept.
 */
export function nextRedirects(
  before: Showcase,
  after: Showcase,
  existing: CatalogueRedirect[],
): CatalogueRedirect[] {
  const old = addresses(before);
  const now = addresses(after);
  const added: CatalogueRedirect[] = [];
  for (const kind of ['product', 'category', 'series'] as const) {
    for (const [id, slug] of old[kind]) {
      const current = now[kind].get(id);
      if (current !== undefined && current !== slug) added.push({ kind, from: slug, to: id });
    }
  }
  const taken = (r: CatalogueRedirect) => [...now[r.kind].values()].includes(r.from);
  const merged = [
    ...existing.filter((r) => !added.some((a) => a.kind === r.kind && a.from === r.from)),
    ...added,
  ].filter((r) => !taken(r));
  return merged.slice(-MAX_REDIRECTS);
}

/** Each redirect as old and new address (without language prefix), when its target is public. */
export function redirectPaths(showcase: Showcase): { from: string; to: string }[] {
  const now = addresses(showcase);
  return showcase.redirects.flatMap((r) => {
    const slug = now[r.kind].get(r.to);
    return slug && slug !== r.from
      ? [{ from: cataloguePath(r.kind, r.from), to: cataloguePath(r.kind, slug) }]
      : [];
  });
}

/* ---------------------------------------- Category filters ---------------------------------------- */

/** One filter on a category page: an attribute marked filterable, or the finishes. */
export interface FilterGroup {
  /** `a:<attribute id>` or `finish`. */
  id: string;
  /** The attribute, or null for finishes. */
  attribute: Attribute | null;
  options: {
    token: string;
    value: AttributeValue | null;
    finishId: string | null;
    count: number;
  }[];
}

/** A value's filter token, e.g. `a:attgangs=2`; text values aren't filtered. */
function valueToken(attributeId: string, value: AttributeValue): string | null {
  if ('choice' in value) return `a:${attributeId}=${value.choice}`;
  if ('yes' in value) return `a:${attributeId}=${value.yes ? 'yes' : 'no'}`;
  if ('number' in value) return `a:${attributeId}=${value.number}`;
  return null;
}

/** The filter tokens a product matches (D-052). */
export function productFilterTokens(showcase: Showcase, product: ShowcaseProduct): string[] {
  const filterable = new Set(showcase.attributes.filter((a) => a.filterable).map((a) => a.id));
  const tokens: string[] = [];
  for (const [id, value] of Object.entries(product.values)) {
    if (!filterable.has(id)) continue;
    const token = valueToken(id, value);
    if (token) tokens.push(token);
  }
  for (const finishId of product.finishIds) tokens.push(`finish=${finishId}`);
  return tokens;
}

/**
 * The filters worth offering for a list of products (D-052): each filterable choice, yes/no or
 * number attribute, and the finishes, when the products have at least two different values.
 * Options follow the attribute's choice order, numbers ascending, and the catalogue's finishes.
 */
export function filterGroups(showcase: Showcase, products: ShowcaseProduct[]): FilterGroup[] {
  const groups: FilterGroup[] = [];
  for (const attribute of showcase.attributes) {
    if (!attribute.filterable || attribute.type === 'text') continue;
    const counts = new Map<string, { value: AttributeValue; count: number }>();
    for (const product of products) {
      const value = product.values[attribute.id];
      const token = value ? valueToken(attribute.id, value) : null;
      if (!value || !token) continue;
      const entry = counts.get(token) ?? { value, count: 0 };
      entry.count++;
      counts.set(token, entry);
    }
    if (counts.size < 2) continue;
    const order = (value: AttributeValue) =>
      'choice' in value
        ? attribute.choices.findIndex((c) => c.id === value.choice)
        : 'number' in value
          ? value.number
          : 'yes' in value
            ? Number(!value.yes)
            : 0;
    const options = [...counts]
      .map(([token, { value, count }]) => ({ token, value, finishId: null, count }))
      .sort((a, b) => order(a.value) - order(b.value));
    groups.push({ id: `a:${attribute.id}`, attribute, options });
  }
  const finishCounts = new Map<string, number>();
  for (const product of products) {
    for (const id of product.finishIds) finishCounts.set(id, (finishCounts.get(id) ?? 0) + 1);
  }
  if (finishCounts.size >= 2) {
    groups.push({
      id: 'finish',
      attribute: null,
      options: showcase.finishes
        .filter((f) => finishCounts.has(f.id))
        .map((f) => ({
          token: `finish=${f.id}`,
          value: null,
          finishId: f.id,
          count: finishCounts.get(f.id)!,
        })),
    });
  }
  return groups;
}
