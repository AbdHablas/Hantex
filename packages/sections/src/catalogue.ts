import { z } from 'zod';
import { RESERVED_SLUGS, bilingual, emptyText, itemId, mediaIds, slugSchema } from './primitives';
import type { Bilingual } from './primitives';

/**
 * A website's product catalogue (D-026, D-045). Nothing here is specific to one kind of product:
 * categories, attribute definitions and finishes are each website's own data. The structure
 * (categories, attribute groups, attributes, finishes and the product order) is one site document,
 * `catalogue`; each product is a `product` document keyed by its id. Both have drafts and
 * numbered versions and go live through *Publish changes*, checked by `checkCatalogue`.
 *
 * No fact is pre-filled: every name, value, finish and code is entered by the website's team.
 */

const image = z.strictObject({ mediaId: z.uuid() });

export const categorySchema = z.strictObject({
  id: itemId,
  name: bilingual(80),
  slug: slugSchema,
  /** A sub-category; at most three levels. */
  parentId: itemId.nullable(),
  /** Main categories lead menus, the home page and search (D-026). */
  main: z.boolean(),
  description: bilingual(500),
  image: image.nullable(),
  /** The attributes products in this category (and its sub-categories) can have. */
  attributeIds: z.array(itemId).max(60),
});
export type Category = z.infer<typeof categorySchema>;

export const attributeGroupSchema = z.strictObject({ id: itemId, name: bilingual(60) });
export type AttributeGroup = z.infer<typeof attributeGroupSchema>;

export const ATTRIBUTE_TYPES = ['text', 'number', 'choice', 'yes-no'] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export const attributeSchema = z
  .strictObject({
    id: itemId,
    name: bilingual(80),
    groupId: itemId.nullable(),
    type: z.enum(ATTRIBUTE_TYPES),
    /** Numbers only, e.g. "A", "V", "mm", "lm". Written the same in every language. */
    unit: z.string().trim().max(12),
    /** Choice attributes only. */
    choices: z.array(z.strictObject({ id: itemId, label: bilingual(60) })).max(60),
    /** Offered as a filter on category pages. */
    filterable: z.boolean(),
  })
  .refine((a) => a.type === 'choice' || a.choices.length === 0, {
    message: 'Only choice attributes have choices',
    path: ['choices'],
  })
  .refine((a) => a.type === 'number' || a.unit === '', {
    message: 'Only numbers have a unit',
    path: ['unit'],
  });
export type Attribute = z.infer<typeof attributeSchema>;

export const FINISH_MATERIALS = [
  'plastic',
  'metal',
  'glass',
  'wood',
  'stone',
  'leather',
  'fabric',
  'other',
] as const;

/** The swatch a new finish starts with, until the team picks its colour. */
export const DEFAULT_SWATCH = '#ffffff';

export const finishSchema = z.strictObject({
  id: itemId,
  name: bilingual(60),
  /** The colour shown as a swatch. */
  swatch: z.string().regex(/^#[0-9a-f]{6}$/, 'Use a colour like #1a2b3c'),
  material: z.enum(FINISH_MATERIALS),
  /** A close-up photo of the finish, shown instead of the plain swatch when present. */
  image: image.nullable(),
});
export type Finish = z.infer<typeof finishSchema>;

export const MAX_PRODUCTS = 5000;

export const catalogueSchema = z.strictObject({
  version: z.literal(1),
  /** In display order; sub-categories follow their parent's order among siblings. */
  categories: z.array(categorySchema).max(300),
  groups: z.array(attributeGroupSchema).max(30),
  attributes: z.array(attributeSchema).max(300),
  finishes: z.array(finishSchema).max(300),
  /** Every product of the site, in display order. */
  products: z.array(itemId).max(MAX_PRODUCTS),
});
export type Catalogue = z.infer<typeof catalogueSchema>;

export const DEFAULT_CATALOGUE: Catalogue = {
  version: 1,
  categories: [],
  groups: [],
  attributes: [],
  finishes: [],
  products: [],
};

/** A product's value for one attribute; its kind must match the attribute's type. */
export const attributeValueSchema = z.union([
  z.strictObject({ text: bilingual(200) }),
  z.strictObject({ number: z.number().finite().min(-1e9).max(1e9) }),
  z.strictObject({ choice: itemId }),
  z.strictObject({ yes: z.boolean() }),
]);
export type AttributeValue = z.infer<typeof attributeValueSchema>;

/** A product's code: letters, digits and . _ / - as printed on the packaging. */
export const skuSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^(?:[A-Za-z0-9][A-Za-z0-9._/-]*)?$/, 'Use letters, digits and . _ / -');

export const variantSchema = z.strictObject({
  id: itemId,
  sku: skuSchema,
  finishId: itemId.nullable(),
  /** Shown when a variant differs by more than its finish; the finish name is used otherwise. */
  name: bilingual(80),
  images: z.array(image).max(12),
});
export type Variant = z.infer<typeof variantSchema>;

export const productSchema = z.strictObject({
  name: bilingual(120),
  slug: slugSchema,
  categoryId: itemId,
  /** Also listed in these categories. */
  extraCategoryIds: z.array(itemId).max(5),
  summary: bilingual(300),
  /** Plain paragraphs separated by blank lines. */
  description: bilingual(5000),
  images: z.array(image).max(20),
  /** Values by attribute id; attributes left out show nothing. */
  values: z.record(itemId, attributeValueSchema),
  variants: z.array(variantSchema).max(60),
  /** Hidden products keep their content but are not built or listed. */
  visible: z.boolean(),
});
export type Product = z.infer<typeof productSchema>;

export function newProduct(name: Bilingual, slug: string, categoryId: string): Product {
  return {
    name,
    slug,
    categoryId,
    extraCategoryIds: [],
    summary: emptyText(),
    description: emptyText(),
    images: [],
    values: {},
    variants: [],
    // New products start hidden, so nothing half-entered goes public.
    visible: false,
  };
}

/** A category and the categories above it, nearest first. */
export function categoryPath(catalogue: Catalogue, categoryId: string): Category[] {
  const byId = new Map(catalogue.categories.map((c) => [c.id, c]));
  const path: Category[] = [];
  let current = byId.get(categoryId);
  while (current && path.length < 4 && !path.includes(current)) {
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** The attributes a product can have: those of its categories and the categories above them. */
export function productAttributes(catalogue: Catalogue, product: Product): Attribute[] {
  const ids = new Set<string>();
  for (const categoryId of [product.categoryId, ...product.extraCategoryIds]) {
    for (const category of categoryPath(catalogue, categoryId)) {
      for (const id of category.attributeIds) ids.add(id);
    }
  }
  return catalogue.attributes.filter((a) => ids.has(a.id));
}

/** Whether a stored value fits its attribute (type, and choice still defined). */
export function valueFits(attribute: Attribute, value: AttributeValue): boolean {
  switch (attribute.type) {
    case 'text':
      return 'text' in value;
    case 'number':
      return 'number' in value;
    case 'yes-no':
      return 'yes' in value;
    case 'choice':
      return 'choice' in value && attribute.choices.some((c) => c.id === value.choice);
  }
}

/* ------------------------------------------ Checks ------------------------------------------ */

export interface CatalogueIssue {
  code:
    | 'missing-name'
    | 'duplicate-id'
    | 'duplicate-address'
    | 'reserved-address'
    | 'missing-parent'
    | 'nested-too-deep'
    | 'missing-group'
    | 'missing-attribute'
    | 'missing-category'
    | 'missing-product'
    | 'wrong-value'
    | 'missing-finish'
    | 'duplicate-sku'
    | 'missing-image';
  /** What is concerned: `category:<id>`, `attribute:<id>`, `finish:<id>` or `product:<id>`. */
  target: string;
  detail?: string;
}

export interface CatalogueDraft {
  catalogue: Catalogue;
  products: Map<string, Product>;
  locales: readonly string[];
  /** The website's media library images; when given, images that no longer exist are reported. */
  media?: ReadonlySet<string>;
}

const filled = (text: Bilingual, locales: readonly string[]) =>
  locales.every((l) => (text[l as keyof Bilingual] ?? '').trim() !== '');

/**
 * Cross-checks run before publishing: names in every language the site uses, unique ids,
 * addresses and codes, a category tree at most three levels deep, and references (categories,
 * attribute groups, attributes, choices, finishes, images) that exist. Hidden products are
 * checked only for what would break the catalogue, not for missing translations.
 */
export function checkCatalogue(draft: CatalogueDraft): CatalogueIssue[] {
  const { catalogue, products, locales } = draft;
  const issues: CatalogueIssue[] = [];
  const named = (text: Bilingual, target: string, detail?: string) => {
    if (!filled(text, locales)) {
      issues.push({ code: 'missing-name', target, ...(detail ? { detail } : {}) });
    }
  };

  const ids = new Set<string>();
  const unique = (id: string, target: string) => {
    if (ids.has(id)) issues.push({ code: 'duplicate-id', target });
    ids.add(id);
  };

  const categories = new Map(catalogue.categories.map((c) => [c.id, c]));
  const groups = new Set(catalogue.groups.map((g) => g.id));
  const attributes = new Map(catalogue.attributes.map((a) => [a.id, a]));
  const finishes = new Set(catalogue.finishes.map((f) => f.id));

  for (const group of catalogue.groups) {
    unique(group.id, `group:${group.id}`);
    named(group.name, `group:${group.id}`);
  }

  const categorySlugs = new Set<string>();
  for (const category of catalogue.categories) {
    const target = `category:${category.id}`;
    unique(category.id, target);
    named(category.name, target);
    if ((RESERVED_SLUGS as readonly string[]).includes(category.slug)) {
      issues.push({ code: 'reserved-address', target, detail: category.slug });
    }
    if (categorySlugs.has(category.slug)) {
      issues.push({ code: 'duplicate-address', target, detail: category.slug });
    }
    categorySlugs.add(category.slug);
    if (category.parentId !== null && !categories.has(category.parentId)) {
      issues.push({ code: 'missing-parent', target });
    } else {
      // Three levels at most, and never a loop.
      let depth = 1;
      let parent = category.parentId ? categories.get(category.parentId) : undefined;
      while (parent && depth <= 3) {
        depth++;
        parent = parent.parentId ? categories.get(parent.parentId) : undefined;
      }
      if (depth > 3) issues.push({ code: 'nested-too-deep', target });
    }
    for (const id of category.attributeIds) {
      if (!attributes.has(id)) issues.push({ code: 'missing-attribute', target, detail: id });
    }
  }

  for (const attribute of catalogue.attributes) {
    const target = `attribute:${attribute.id}`;
    unique(attribute.id, target);
    named(attribute.name, target);
    if (attribute.groupId !== null && !groups.has(attribute.groupId)) {
      issues.push({ code: 'missing-group', target });
    }
    if (attribute.type === 'choice' && attribute.choices.length === 0) {
      issues.push({ code: 'missing-name', target, detail: 'choices' });
    }
    const choiceIds = new Set<string>();
    for (const choice of attribute.choices) {
      if (choiceIds.has(choice.id))
        issues.push({ code: 'duplicate-id', target, detail: choice.id });
      choiceIds.add(choice.id);
      named(choice.label, target, choice.id);
    }
  }

  for (const finish of catalogue.finishes) {
    const target = `finish:${finish.id}`;
    unique(finish.id, target);
    named(finish.name, target);
  }

  const productSlugs = new Map<string, string>();
  const skus = new Map<string, string>();
  const listed = new Set<string>();
  for (const productId of catalogue.products) {
    const target = `product:${productId}`;
    if (listed.has(productId)) issues.push({ code: 'duplicate-id', target });
    listed.add(productId);
    const product = products.get(productId);
    if (!product) {
      issues.push({ code: 'missing-product', target });
      continue;
    }
    let categorised = true;
    for (const categoryId of [product.categoryId, ...product.extraCategoryIds]) {
      if (!categories.has(categoryId)) {
        issues.push({ code: 'missing-category', target, detail: categoryId });
        categorised = false;
      }
    }
    // Values are checked against the categories' attributes once the categories are right.
    const allowed = new Set(productAttributes(catalogue, product).map((a) => a.id));
    for (const [attributeId, value] of categorised ? Object.entries(product.values) : []) {
      const attribute = attributes.get(attributeId);
      if (!attribute || !allowed.has(attributeId)) {
        issues.push({ code: 'missing-attribute', target, detail: attributeId });
      } else if (!valueFits(attribute, value)) {
        issues.push({ code: 'wrong-value', target, detail: attributeId });
      } else if ('text' in value && product.visible && !filled(value.text, locales)) {
        issues.push({ code: 'missing-name', target, detail: attributeId });
      }
    }
    const variantIds = new Set<string>();
    for (const variant of product.variants) {
      if (variantIds.has(variant.id)) {
        issues.push({ code: 'duplicate-id', target, detail: variant.id });
      }
      variantIds.add(variant.id);
      if (variant.finishId !== null && !finishes.has(variant.finishId)) {
        issues.push({ code: 'missing-finish', target, detail: variant.id });
      }
      // A variant needs a name in each language unless its finish names it.
      if (product.visible && variant.finishId === null) named(variant.name, target, variant.id);
      if (variant.sku !== '') {
        const owner = skus.get(variant.sku.toLowerCase());
        if (owner !== undefined && owner !== `${productId}:${variant.id}`) {
          issues.push({ code: 'duplicate-sku', target, detail: variant.sku });
        }
        skus.set(variant.sku.toLowerCase(), `${productId}:${variant.id}`);
      }
    }
    if (!product.visible) continue;
    named(product.name, target);
    const other = productSlugs.get(product.slug);
    if (other !== undefined) {
      issues.push({ code: 'duplicate-address', target, detail: product.slug });
    }
    productSlugs.set(product.slug, productId);
  }

  if (draft.media) {
    const check = (value: unknown, target: string) => {
      for (const mediaId of mediaIds(value)) {
        if (!draft.media?.has(mediaId)) {
          issues.push({ code: 'missing-image', target, detail: mediaId });
        }
      }
    };
    for (const category of catalogue.categories) check(category, `category:${category.id}`);
    for (const finish of catalogue.finishes) check(finish, `finish:${finish.id}`);
    for (const productId of catalogue.products) {
      const product = products.get(productId);
      if (product?.visible) check(product, `product:${productId}`);
    }
  }
  return issues;
}
