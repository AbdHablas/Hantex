import { documentDrafts, documentVersions, users } from '@hantex/db/worker';
import {
  MAX_PRODUCTS,
  attributeGroupSchema,
  attributeSchema,
  bilingual,
  categorySchema,
  checkCatalogue,
  finishSchema,
  itemId,
  newProduct,
  productSchema,
  slugSchema,
  type Catalogue,
  type Product,
} from '@hantex/sections';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import {
  draftCatalogue,
  publishedCatalogueVersions,
  type CatalogueContent,
} from '../lib/catalogue-content';
import { currentDraft, latestPublished, saveDraft } from '../lib/documents';
import { badRequest, conflict, notFound } from '../lib/errors';
import { libraryIds } from '../lib/media-library';
import { sameData } from '../lib/site-content';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/session';

/**
 * A website's product catalogue (D-026, D-045): categories, attribute groups and attributes,
 * finishes, and products with their variants, all saved as drafts. They go live with the rest
 * of the site through *Publish changes*, which runs `checkCatalogue` first.
 */

const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });
const idParam = validate('param', z.object({ id: itemId }));
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

const structureSchema = z.strictObject({
  categories: z.array(categorySchema).max(300),
  groups: z.array(attributeGroupSchema).max(30),
  attributes: z.array(attributeSchema).max(300),
  finishes: z.array(finishSchema).max(300),
});
type Structure = z.infer<typeof structureSchema>;

async function catalogueDraft(v: AppEnv['Variables']) {
  return (await currentDraft(v.db, v.site.id, 'catalogue')).data as Catalogue;
}

/**
 * Changes to the structure that would leave the draft catalogue broken are refused while editing:
 * a category tree that loops or is deeper than three levels, repeated ids, and removing (or
 * changing the type of) anything a product still uses. Translations and the rest are checked
 * when publishing.
 */
function structureProblem(next: Structure, content: CatalogueContent) {
  const ids = [
    ...next.categories.map((c) => c.id),
    ...next.groups.map((g) => g.id),
    ...next.attributes.map((a) => a.id),
    ...next.finishes.map((f) => f.id),
  ];
  if (new Set(ids).size !== ids.length) return badRequest('duplicate-id');

  const categories = new Map(next.categories.map((c) => [c.id, c]));
  for (const category of next.categories) {
    let depth = 1;
    let parentId = category.parentId;
    while (parentId !== null) {
      const parent = categories.get(parentId);
      if (!parent) return badRequest('missing-parent', { id: category.id });
      if (++depth > 3) return badRequest('nested-too-deep', { id: category.id });
      parentId = parent.parentId;
    }
  }
  const groups = new Set(next.groups.map((g) => g.id));
  const attributes = new Map(next.attributes.map((a) => [a.id, a]));
  if (next.attributes.some((a) => a.groupId !== null && !groups.has(a.groupId))) {
    return badRequest('missing-group');
  }
  if (next.categories.some((c) => c.attributeIds.some((id) => !attributes.has(id)))) {
    return badRequest('missing-attribute');
  }
  const finishes = new Set(next.finishes.map((f) => f.id));
  const before = new Map(content.catalogue.attributes.map((a) => [a.id, a]));

  for (const [productId, product] of content.products) {
    for (const categoryId of [product.categoryId, ...product.extraCategoryIds]) {
      if (!categories.has(categoryId)) return conflict('category-in-use', { productId });
    }
    for (const [attributeId, value] of Object.entries(product.values)) {
      const attribute = attributes.get(attributeId);
      if (!attribute) return conflict('attribute-in-use', { productId, attributeId });
      if (attribute.type !== before.get(attributeId)?.type) {
        return conflict('attribute-in-use', { productId, attributeId });
      }
      if ('choice' in value && !attribute.choices.some((c) => c.id === value.choice)) {
        return conflict('choice-in-use', { productId, attributeId });
      }
    }
    for (const variant of product.variants) {
      if (variant.finishId !== null && !finishes.has(variant.finishId)) {
        return conflict('finish-in-use', { productId });
      }
    }
  }
  return null;
}

function freeSlug(content: CatalogueContent, base: string) {
  const taken = new Set([...content.products.values()].map((p) => p.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base.slice(0, 54)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw conflict('slug-taken');
}

export const catalogueRoutes = new Hono<AppEnv>()
  /** The structure, every product in order with its state, and what would stop publishing. */
  .get('/', requirePermission('catalogue.view'), async (c) => {
    const v = c.var;
    const [content, published, media] = await Promise.all([
      draftCatalogue(v.db, v.site.id),
      publishedCatalogueVersions(v.db, v.site.id),
      libraryIds(v.db, v.site.id),
    ]);
    const { categories, groups, attributes, finishes, products: order } = content.catalogue;
    const live = published.get('catalogue:');
    return c.json({
      structure: { categories, groups, attributes, finishes },
      structureChanged: !live || !sameData(live.data, content.catalogue),
      products: order
        .filter((id) => content.products.has(id))
        .map((id) => {
          const product = content.products.get(id) as Product;
          const version = published.get(`product:${id}`);
          return {
            id,
            name: product.name,
            slug: product.slug,
            categoryId: product.categoryId,
            visible: product.visible,
            variants: product.variants.length,
            image:
              product.images[0] ?? product.variants.find((x) => x.images[0])?.images[0] ?? null,
            published:
              version !== undefined &&
              (live?.data as Catalogue | undefined)?.products.includes(id) === true,
            changed: !version || !sameData(version.data, product),
          };
        }),
      issues: checkCatalogue({ ...content, locales: v.site.locales, media }),
    });
  })

  .put(
    '/structure',
    requirePermission('catalogue.edit'),
    validate('json', structureSchema),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      const content = await draftCatalogue(v.db, v.site.id);
      const problem = structureProblem(body, content);
      if (problem) throw problem;
      const catalogue = await catalogueDraft(v);
      await saveDraft(v.db, v.site.id, 'catalogue', { ...catalogue, ...body }, v.access.userId);
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'catalogue.structure-saved',
          siteId: v.site.id,
          targetType: 'catalogue',
          targetId: v.site.key,
        },
        v.requestId,
      );
      return c.json({ ok: true });
    },
  )

  .put(
    '/order',
    requirePermission('catalogue.edit'),
    validate('json', z.strictObject({ products: z.array(itemId).max(MAX_PRODUCTS) })),
    async (c) => {
      const v = c.var;
      const { products } = c.req.valid('json');
      const catalogue = await catalogueDraft(v);
      // Reordering never adds or removes products.
      const same =
        products.length === catalogue.products.length &&
        new Set(products).size === products.length &&
        products.every((id) => catalogue.products.includes(id));
      if (!same) throw badRequest('invalid-order');
      await saveDraft(v.db, v.site.id, 'catalogue', { ...catalogue, products }, v.access.userId);
      return c.json({ ok: true });
    },
  )

  /* --------------------------------------------- Products --------------------------------------------- */

  .post(
    '/products',
    requirePermission('catalogue.edit'),
    validate(
      'json',
      z.strictObject({ name: bilingual(120), slug: slugSchema, categoryId: itemId }),
    ),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      const content = await draftCatalogue(v.db, v.site.id);
      const catalogue = content.catalogue;
      if (!catalogue.categories.some((x) => x.id === body.categoryId)) {
        throw badRequest('unknown-category');
      }
      if (catalogue.products.length >= MAX_PRODUCTS) throw conflict('too-many-products');
      const id = newId();
      const product = newProduct(body.name, freeSlug(content, body.slug), body.categoryId);
      await saveDraft(v.db, v.site.id, 'product', product, v.access.userId, id);
      await saveDraft(
        v.db,
        v.site.id,
        'catalogue',
        { ...catalogue, products: [...catalogue.products, id] },
        v.access.userId,
      );
      await writeAudit(
        v.db,
        auditActor(v),
        { action: 'product.created', siteId: v.site.id, targetType: 'product', targetId: id },
        v.requestId,
      );
      return c.json({ id, slug: product.slug }, 201);
    },
  )

  .get('/products/:id', requirePermission('catalogue.view'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    if (!(await catalogueDraft(v)).products.includes(id)) throw notFound();
    const draft = await currentDraft(v.db, v.site.id, 'product', id);
    const published = await latestPublished(v.db, v.site.id, 'product', id);
    return c.json({
      id,
      product: draft.data,
      draftUpdatedAt: draft.updatedAt,
      published: published
        ? { version: published.version, publishedAt: published.publishedAt }
        : null,
    });
  })

  .put('/products/:id', requirePermission('catalogue.edit'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const catalogue = await catalogueDraft(v);
    if (!catalogue.products.includes(id)) throw notFound();
    const parsed = productSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw badRequest('invalid-input', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
      });
    }
    const product = parsed.data;
    const categories = new Set(catalogue.categories.map((x) => x.id));
    if (![product.categoryId, ...product.extraCategoryIds].every((x) => categories.has(x))) {
      throw badRequest('unknown-category');
    }
    await saveDraft(v.db, v.site.id, 'product', product, v.access.userId, id);
    return c.json({ ok: true });
  })

  .post('/products/:id/duplicate', requirePermission('catalogue.edit'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const content = await draftCatalogue(v.db, v.site.id);
    const catalogue = content.catalogue;
    const source = content.products.get(id);
    if (!catalogue.products.includes(id) || !source) throw notFound();
    if (catalogue.products.length >= MAX_PRODUCTS) throw conflict('too-many-products');
    const copyId = newId();
    const copy: Product = {
      ...structuredClone(source),
      slug: freeSlug(content, `${source.slug.slice(0, 50)}-copy`),
      // Product codes belong to one product; the copy starts hidden with new variant ids and
      // empty codes, so nothing goes public twice by accident.
      variants: source.variants.map((x) => ({ ...structuredClone(x), id: newId(), sku: '' })),
      visible: false,
    };
    await saveDraft(v.db, v.site.id, 'product', copy, v.access.userId, copyId);
    const products = [...catalogue.products];
    products.splice(products.indexOf(id) + 1, 0, copyId);
    await saveDraft(v.db, v.site.id, 'catalogue', { ...catalogue, products }, v.access.userId);
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'product.duplicated',
        siteId: v.site.id,
        targetType: 'product',
        targetId: copyId,
        details: { from: id },
      },
      v.requestId,
    );
    return c.json({ id: copyId }, 201);
  })

  .delete('/products/:id', requirePermission('catalogue.delete'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const catalogue = await catalogueDraft(v);
    if (!catalogue.products.includes(id)) throw notFound();
    // The product leaves the draft catalogue; its published versions stay for history until the
    // next Publish changes removes it from the website.
    await saveDraft(
      v.db,
      v.site.id,
      'catalogue',
      { ...catalogue, products: catalogue.products.filter((p) => p !== id) },
      v.access.userId,
    );
    await v.db
      .delete(documentDrafts)
      .where(
        and(
          eq(documentDrafts.siteId, v.site.id),
          eq(documentDrafts.kind, 'product'),
          eq(documentDrafts.key, id),
        ),
      );
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'product.deleted', siteId: v.site.id, targetType: 'product', targetId: id },
      v.requestId,
    );
    return c.json({ ok: true });
  })

  .get('/products/:id/versions', requirePermission('catalogue.view'), idParam, async (c) => {
    const { id } = c.req.valid('param');
    const rows = await c.var.db
      .select({
        version: documentVersions.version,
        publishedAt: documentVersions.publishedAt,
        publishedBy: users.name,
      })
      .from(documentVersions)
      .leftJoin(users, eq(users.id, documentVersions.publishedBy))
      .where(
        and(
          eq(documentVersions.siteId, c.var.site.id),
          eq(documentVersions.kind, 'product'),
          eq(documentVersions.key, id),
        ),
      )
      .orderBy(desc(documentVersions.version))
      .limit(50);
    return c.json(rows);
  })

  /** Restoring a version puts it back into the draft; it goes live with the next Publish changes. */
  .post(
    '/products/:id/restore',
    requirePermission('catalogue.edit'),
    idParam,
    validate('json', z.strictObject({ version: z.number().int().positive() })),
    async (c) => {
      const v = c.var;
      const { id } = c.req.valid('param');
      const [row] = await v.db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.siteId, v.site.id),
            eq(documentVersions.kind, 'product'),
            eq(documentVersions.key, id),
            eq(documentVersions.version, c.req.valid('json').version),
          ),
        );
      if (!row) throw notFound();
      const parsed = productSchema.safeParse(row.data);
      if (!parsed.success) throw conflict('version-incompatible');
      const catalogue = await catalogueDraft(v);
      const categories = new Set(catalogue.categories.map((x) => x.id));
      if (
        ![parsed.data.categoryId, ...parsed.data.extraCategoryIds].every((x) => categories.has(x))
      ) {
        throw conflict('version-incompatible');
      }
      const listed = catalogue.products.includes(id);
      if (!listed && catalogue.products.length >= MAX_PRODUCTS) {
        throw conflict('too-many-products');
      }
      await saveDraft(v.db, v.site.id, 'product', parsed.data, v.access.userId, id);
      if (!listed) {
        await saveDraft(
          v.db,
          v.site.id,
          'catalogue',
          { ...catalogue, products: [...catalogue.products, id] },
          v.access.userId,
        );
      }
      return c.json({ ok: true });
    },
  );
