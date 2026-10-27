import type { Catalogue, CatalogueIssue, ImageRef, Product } from '@hantex/sections';
import { useQuery } from '@tanstack/react-query';
import { api, sitePath } from './api';
import { useCurrentSite } from './session';

/**
 * The product catalogue's data (apps/api/src/routes/catalogue.ts, D-026, D-045): the structure
 * (categories, attribute groups, attributes, finishes) and the products, all saved as drafts and
 * published with the rest of the site through Publish changes.
 */

export type CatalogueStructure = Omit<Catalogue, 'version' | 'products'>;

export interface ProductSummary {
  id: string;
  name: { ar: string; en: string };
  slug: string;
  categoryId: string;
  visible: boolean;
  variants: number;
  image: NonNullable<ImageRef> | null;
  published: boolean;
  changed: boolean;
}

export interface CatalogueListing {
  structure: CatalogueStructure;
  structureChanged: boolean;
  products: ProductSummary[];
  issues: CatalogueIssue[];
}

export interface ProductResponse {
  id: string;
  product: Product;
  draftUpdatedAt: string | null;
  published: { version: number; publishedAt: string } | null;
}

export function useCatalogueKeys() {
  const { siteKey } = useCurrentSite();
  // Under the builder's key, so every builder change (and Publish changes) refreshes it too.
  const base = ['site', siteKey, 'builder', 'catalogue'] as const;
  return { siteKey, base, product: (id: string) => [...base, 'product', id] as const };
}

export function useCatalogue() {
  const { site, can } = useCurrentSite();
  const keys = useCatalogueKeys();
  return useQuery({
    queryKey: keys.base,
    queryFn: () => api<CatalogueListing>(sitePath(keys.siteKey, '/catalogue')),
    enabled: site !== null && can('catalogue.view'),
  });
}

export function useProduct(id: string) {
  const { site } = useCurrentSite();
  const keys = useCatalogueKeys();
  return useQuery({
    queryKey: keys.product(id),
    queryFn: () => api<ProductResponse>(sitePath(keys.siteKey, `/catalogue/products/${id}`)),
    enabled: site !== null && id !== '',
  });
}

/** JSON with object keys sorted: data read back from the database (JSONB reorders keys) compares equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export const sameData = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
