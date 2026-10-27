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
  keepVerification,
  mergeSheetProduct,
  newProduct,
  productSchema,
  seriesSchema,
  sheetImportSchema,
  slugSchema,
  type Catalogue,
  type DocumentRef,
  type Product,
} from '@hantex/sections';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import {
  draftCatalogue,
  publishedCatalogueVersions,
  withCatalogueLock,
  type CatalogueContent,
  type Reader,
} from '../lib/catalogue-content';
import { currentDraft, latestPublished, saveDraft } from '../lib/documents';
import { badRequest, conflict, notFound } from '../lib/errors';
import { libraryIds } from '../lib/media-library';
import { fileLibraryIds } from '../lib/site-files';
import { sameData } from '../lib/site-content';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/session';

/**
 * A website's product catalogue (D-026, D-045): categories, attribute groups and attributes,
 * finishes, series, and products with their variants and documents, all saved as drafts. They go
 * live with the rest of the site through *Publish changes*, which runs `checkCatalogue` first.
 *
 * Every change that reads the catalogue and writes it back holds the site's catalogue lock, so
 * two people saving at once never lose each other's products. A certificate's verification is
 * kept by the API: saves carry it over only while the file and details stay the same, and only
 * someone with `catalogue.verify` can set it.
 */

const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });
const idParam = validate('param', z.object({ id: itemId }));
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
/** Request size caps: a product, or the whole structure, well above what the limits allow. */
const sizeLimit = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: () => {
      throw badRequest('too-large');
    },
  });

const structureSchema = z.strictObject({
  categories: z.array(categorySchema).max(300),
  groups: z.array(attributeGroupSchema).max(30),
  attributes: z.array(attributeSchema).max(300),
  finishes: z.array(finishSchema).max(300),
  series: z.array(seriesSchema).max(200),
});
type Structure = z.infer<typeof structureSchema>;

async function catalogueDraft(db: Reader, siteId: string) {
  return (await currentDraft(db, siteId, 'catalogue')).data as Catalogue;
}

/** Unverified copies: a verification belongs to the document it was made on. */
const unverified = (documents: DocumentRef[]) => documents.map((d) => ({ ...d, verified: null }));

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
    ...next.series.map((x) => x.id),
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
  if (next.series.some((x) => x.finishIds.some((id) => !finishes.has(id)))) {
    return badRequest('missing-finish');
  }
  const series = new Set(next.series.map((x) => x.id));
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
    if (product.seriesId !== null && !series.has(product.seriesId)) {
      return conflict('series-in-use', { productId });
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
    const [content, published, media, files] = await Promise.all([
      draftCatalogue(v.db, v.site.id),
      publishedCatalogueVersions(v.db, v.site.id),
      libraryIds(v.db, v.site.id),
      fileLibraryIds(v.db, v.site.id),
    ]);
    const { categories, groups, attributes, finishes, series, products: order } = content.catalogue;
    const live = published.get('catalogue:');
    const liveProducts = new Set((live?.data as Catalogue | undefined)?.products ?? []);
    return c.json({
      structure: { categories, groups, attributes, finishes, series },
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
            seriesId: product.seriesId,
            visible: product.visible,
            variants: product.variants.length,
            image:
              product.images[0] ?? product.variants.find((x) => x.images[0])?.images[0] ?? null,
            published: version !== undefined && liveProducts.has(id),
            changed: !version || !sameData(version.data, product),
          };
        }),
      issues: checkCatalogue({ ...content, locales: v.site.locales, media, files }),
    });
  })

  .put(
    '/structure',
    requirePermission('catalogue.edit'),
    sizeLimit(4 * 1024 * 1024),
    validate('json', structureSchema),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      await withCatalogueLock(v.db, v.site.id, async (tx) => {
        const content = await draftCatalogue(tx, v.site.id);
        const problem = structureProblem(body, content);
        if (problem) throw problem;
        const before = new Map(content.catalogue.series.map((x) => [x.id, x.documents]));
        const series = body.series.map((x) => ({
          ...x,
          documents: keepVerification(before.get(x.id) ?? [], x.documents),
        }));
        const catalogue = await catalogueDraft(tx, v.site.id);
        await saveDraft(
          tx,
          v.site.id,
          'catalogue',
          { ...catalogue, ...body, series },
          v.access.userId,
        );
      });
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
      await withCatalogueLock(v.db, v.site.id, async (tx) => {
        const catalogue = await catalogueDraft(tx, v.site.id);
        // Reordering never adds or removes products.
        const current = new Set(catalogue.products);
        const same =
          products.length === catalogue.products.length &&
          new Set(products).size === products.length &&
          products.every((id) => current.has(id));
        if (!same) throw badRequest('invalid-order');
        await saveDraft(tx, v.site.id, 'catalogue', { ...catalogue, products }, v.access.userId);
      });
      return c.json({ ok: true });
    },
  )

  /* ------------------------------------- Spreadsheet import/export ------------------------------------- */

  /** Everything a spreadsheet export needs, and what an import is compared with (D-045). */
  .get('/export', requirePermission('catalogue.view'), async (c) => {
    const content = await draftCatalogue(c.var.db, c.var.site.id);
    return c.json({
      catalogue: content.catalogue,
      products: Object.fromEntries(
        content.catalogue.products
          .filter((id) => content.products.has(id))
          .map((id) => [id, content.products.get(id)]),
      ),
    });
  })

  /**
   * Products read from a spreadsheet, a batch at a time. Each is merged into its draft (or
   * created) and checked as a save from the product form is; one problem refuses the whole batch.
   */
  .post(
    '/import',
    requirePermission('catalogue.edit'),
    sizeLimit(4 * 1024 * 1024),
    validate('json', sheetImportSchema),
    async (c) => {
      const v = c.var;
      const { items } = c.req.valid('json');
      const result = await withCatalogueLock(v.db, v.site.id, async (tx) => {
        const content = await draftCatalogue(tx, v.site.id);
        const catalogue = content.catalogue;
        const order = [...catalogue.products];
        const bySlug = new Map([...content.products].map(([id, p]) => [p.slug, id]));
        const categories = new Set(catalogue.categories.map((x) => x.id));
        const seriesIds = new Set(catalogue.series.map((x) => x.id));
        const seen = new Set<string>();
        const counts = { created: 0, updated: 0, unchanged: 0 };
        for (const [index, item] of items.entries()) {
          if (item.id !== null && !content.products.has(item.id)) {
            throw badRequest('unknown-product', { index });
          }
          const id = item.id ?? (item.slug !== undefined ? bySlug.get(item.slug) : undefined);
          const key = id ?? `new:${item.slug ?? ''}`;
          if (seen.has(key)) throw badRequest('duplicate-product', { index });
          seen.add(key);
          const existing = id ? (content.products.get(id) ?? null) : null;
          const merged = mergeSheetProduct(existing, item, newId);
          if (!merged.ok) throw badRequest(merged.problem, { index });
          const parsed = productSchema.safeParse(merged.product);
          if (!parsed.success) {
            throw badRequest('invalid-input', {
              index,
              issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
            });
          }
          const product = parsed.data;
          if (![product.categoryId, ...product.extraCategoryIds].every((x) => categories.has(x))) {
            throw badRequest('unknown-category', { index });
          }
          if (product.seriesId !== null && !seriesIds.has(product.seriesId)) {
            throw badRequest('unknown-series', { index });
          }
          if (existing && sameData(existing, product)) {
            counts.unchanged++;
            continue;
          }
          const productId = id ?? newId();
          if (!id) {
            if (order.length >= MAX_PRODUCTS) throw conflict('too-many-products');
            order.push(productId);
            bySlug.set(product.slug, productId);
            seen.add(productId);
            counts.created++;
          } else {
            counts.updated++;
          }
          const documents = keepVerification(existing?.documents ?? [], product.documents);
          await saveDraft(
            tx,
            v.site.id,
            'product',
            { ...product, documents },
            v.access.userId,
            productId,
          );
        }
        if (counts.created > 0) {
          await saveDraft(
            tx,
            v.site.id,
            'catalogue',
            { ...catalogue, products: order },
            v.access.userId,
          );
        }
        return counts;
      });
      if (result.created + result.updated > 0) {
        await writeAudit(
          v.db,
          auditActor(v),
          {
            action: 'catalogue.imported',
            siteId: v.site.id,
            targetType: 'catalogue',
            targetId: v.site.key,
            details: result,
          },
          v.requestId,
        );
      }
      return c.json(result);
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
      const id = newId();
      const product = await withCatalogueLock(v.db, v.site.id, async (tx) => {
        const content = await draftCatalogue(tx, v.site.id);
        const catalogue = content.catalogue;
        if (!catalogue.categories.some((x) => x.id === body.categoryId)) {
          throw badRequest('unknown-category');
        }
        if (catalogue.products.length >= MAX_PRODUCTS) throw conflict('too-many-products');
        const created = newProduct(body.name, freeSlug(content, body.slug), body.categoryId);
        await saveDraft(tx, v.site.id, 'product', created, v.access.userId, id);
        await saveDraft(
          tx,
          v.site.id,
          'catalogue',
          { ...catalogue, products: [...catalogue.products, id] },
          v.access.userId,
        );
        return created;
      });
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
    if (!(await catalogueDraft(v.db, v.site.id)).products.includes(id)) throw notFound();
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

  .put(
    '/products/:id',
    requirePermission('catalogue.edit'),
    sizeLimit(1024 * 1024),
    idParam,
    async (c) => {
      const v = c.var;
      const { id } = c.req.valid('param');
      const parsed = productSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        throw badRequest('invalid-input', {
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
        });
      }
      await withCatalogueLock(v.db, v.site.id, async (tx) => {
        const content = await draftCatalogue(tx, v.site.id);
        const catalogue = content.catalogue;
        if (!catalogue.products.includes(id)) throw notFound();
        const product = parsed.data;
        const categories = new Set(catalogue.categories.map((x) => x.id));
        if (![product.categoryId, ...product.extraCategoryIds].every((x) => categories.has(x))) {
          throw badRequest('unknown-category');
        }
        if (product.seriesId !== null && !catalogue.series.some((x) => x.id === product.seriesId)) {
          throw badRequest('unknown-series');
        }
        const before = content.products.get(id)?.documents ?? [];
        const documents = keepVerification(before, product.documents);
        await saveDraft(tx, v.site.id, 'product', { ...product, documents }, v.access.userId, id);
      });
      return c.json({ ok: true });
    },
  )

  .post('/products/:id/duplicate', requirePermission('catalogue.edit'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const copyId = newId();
    await withCatalogueLock(v.db, v.site.id, async (tx) => {
      const content = await draftCatalogue(tx, v.site.id);
      const catalogue = content.catalogue;
      const source = content.products.get(id);
      if (!catalogue.products.includes(id) || !source) throw notFound();
      if (catalogue.products.length >= MAX_PRODUCTS) throw conflict('too-many-products');
      const copy: Product = {
        ...structuredClone(source),
        slug: freeSlug(content, `${source.slug.slice(0, 50)}-copy`),
        // Product codes belong to one product; the copy starts hidden with new variant ids and
        // empty codes, so nothing goes public twice by accident. Certificates attached to the
        // copy need verifying for it afresh.
        variants: source.variants.map((x) => ({ ...structuredClone(x), id: newId(), sku: '' })),
        documents: unverified(source.documents),
        visible: false,
      };
      await saveDraft(tx, v.site.id, 'product', copy, v.access.userId, copyId);
      const products = [...catalogue.products];
      products.splice(products.indexOf(id) + 1, 0, copyId);
      await saveDraft(tx, v.site.id, 'catalogue', { ...catalogue, products }, v.access.userId);
    });
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
    await withCatalogueLock(v.db, v.site.id, async (tx) => {
      const catalogue = await catalogueDraft(tx, v.site.id);
      if (!catalogue.products.includes(id)) throw notFound();
      // The product leaves the draft catalogue; its published versions stay for history until
      // the next Publish changes removes it from the website.
      await saveDraft(
        tx,
        v.site.id,
        'catalogue',
        { ...catalogue, products: catalogue.products.filter((p) => p !== id) },
        v.access.userId,
      );
      await tx
        .delete(documentDrafts)
        .where(
          and(
            eq(documentDrafts.siteId, v.site.id),
            eq(documentDrafts.kind, 'product'),
            eq(documentDrafts.key, id),
          ),
        );
    });
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
      const restored = parsed.data;
      await withCatalogueLock(v.db, v.site.id, async (tx) => {
        const catalogue = await catalogueDraft(tx, v.site.id);
        const categories = new Set(catalogue.categories.map((x) => x.id));
        if (
          ![restored.categoryId, ...restored.extraCategoryIds].every((x) => categories.has(x)) ||
          (restored.seriesId !== null && !catalogue.series.some((x) => x.id === restored.seriesId))
        ) {
          throw conflict('version-incompatible');
        }
        const listed = catalogue.products.includes(id);
        if (!listed && catalogue.products.length >= MAX_PRODUCTS) {
          throw conflict('too-many-products');
        }
        // A published version's verifications were made on exactly its documents, so they stay.
        await saveDraft(tx, v.site.id, 'product', restored, v.access.userId, id);
        if (!listed) {
          await saveDraft(
            tx,
            v.site.id,
            'catalogue',
            { ...catalogue, products: [...catalogue.products, id] },
            v.access.userId,
          );
        }
      });
      return c.json({ ok: true });
    },
  )

  /* ------------------------------------------ Certificates ------------------------------------------ */

  /**
   * Marks a certificate verified (or not) after someone with `catalogue.verify` has checked its
   * details against the attached file. Only then can the website show it as a certification.
   */
  .post(
    '/verify',
    requirePermission('catalogue.verify'),
    validate(
      'json',
      z.strictObject({
        target: z.strictObject({ type: z.enum(['product', 'series']), id: itemId }),
        documentId: itemId,
        verified: z.boolean(),
      }),
    ),
    async (c) => {
      const v = c.var;
      const { target, documentId, verified } = c.req.valid('json');
      const files = await fileLibraryIds(v.db, v.site.id);
      const verification = verified ? { by: v.access.userId, at: new Date().toISOString() } : null;
      const mark = (documents: DocumentRef[]) => {
        const doc = documents.find((d) => d.id === documentId);
        if (!doc) throw notFound();
        if (verified) {
          if (doc.type !== 'certificate' || !doc.certificate || doc.certificate.name === '') {
            throw badRequest('not-a-certificate');
          }
          if (!files.has(doc.fileId)) throw conflict('file-missing');
        }
        return documents.map((d) => (d.id === documentId ? { ...d, verified: verification } : d));
      };
      await withCatalogueLock(v.db, v.site.id, async (tx) => {
        const content = await draftCatalogue(tx, v.site.id);
        if (target.type === 'product') {
          const product = content.products.get(target.id);
          if (!product) throw notFound();
          const next = { ...product, documents: mark(product.documents) };
          await saveDraft(tx, v.site.id, 'product', next, v.access.userId, target.id);
        } else {
          const catalogue = await catalogueDraft(tx, v.site.id);
          if (!catalogue.series.some((x) => x.id === target.id)) throw notFound();
          const series = catalogue.series.map((x) =>
            x.id === target.id ? { ...x, documents: mark(x.documents) } : x,
          );
          await saveDraft(tx, v.site.id, 'catalogue', { ...catalogue, series }, v.access.userId);
        }
      });
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: verified ? 'catalogue.certificate-verified' : 'catalogue.certificate-unverified',
          siteId: v.site.id,
          targetType: target.type,
          targetId: target.id,
          details: { documentId },
        },
        v.requestId,
      );
      return c.json({ ok: true, verified: verification });
    },
  );
