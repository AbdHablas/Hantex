import {
  categoryTrail,
  cataloguePath,
  formatValue,
  localizedPath,
  paragraphs,
  type ShowcaseProduct,
} from '@hantex/sections';
import { pageHref, pick, shareOf, withSlash, type RenderContext } from './builder';
import { TEXT } from './i18n';
import type { SiteData } from './site-data';

/**
 * Structured data for search engines (schema.org, JSON-LD; D-053), made only from facts entered
 * in the dashboard: nothing is filled in, estimated or assumed. There are no prices or offers
 * (the sites sell nothing online), no reviews or ratings, and no brand unless one is entered.
 * A field without a value is left out rather than sent empty.
 */
export type Json = Record<string, unknown>;

const CONTEXT = 'https://schema.org';

/** Drops empty strings, empty lists and undefined, so nothing is claimed without a value. */
function compact<T extends Json>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
    ),
  ) as T;
}

/**
 * The text of a `<script type="application/ld+json">` block. `<` is escaped so no value can end
 * the script element early; the browser never runs a JSON-LD block.
 */
export const jsonLdText = (data: Json) =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029');

/** Where a crumb leads: the home page, then the categories above, then the page itself. */
export function breadcrumbLd(items: { name: string; url: string }[]): Json | null {
  const named = items.filter((i) => i.name);
  if (named.length < 2) return null;
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: named.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** A list of the products a category or series page shows, by address. */
export function itemListLd(urls: string[]): Json | null {
  if (urls.length === 0) return null;
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    itemListElement: urls.map((url, i) => ({ '@type': 'ListItem', position: i + 1, url })),
  };
}

/** A catalogue page's absolute address in the page's language. */
export const catalogueUrl = (
  ctx: Pick<RenderContext, 'locale' | 'defaultLocale'>,
  origin: string,
  kind: 'product' | 'category' | 'series',
  slug: string,
) =>
  `${origin}${withSlash(localizedPath(cataloguePath(kind, slug), ctx.locale, ctx.defaultLocale))}`;

/** The home page and the categories above a category, as breadcrumb items. */
export function categoryCrumbs(ctx: RenderContext, origin: string, categoryId: string) {
  const showcase = ctx.content.showcase!;
  const home = ctx.content.index.home;
  return [
    ...(home ? [{ name: TEXT[ctx.locale].home, url: `${origin}${pageHref(ctx, home)}` }] : []),
    ...categoryTrail(showcase, categoryId).map((c) => ({
      name: pick(ctx, c.name),
      url: catalogueUrl(ctx, origin, 'category', c.slug),
    })),
  ];
}

/**
 * A product (schema.org Product): its name, address, summary or first paragraph, published
 * photos, category, entered specifications and checked certificates. With two or more product
 * codes it is a ProductGroup whose variants carry their codes and finishes.
 */
export function productLd(ctx: RenderContext, product: ShowcaseProduct, origin: string): Json {
  const showcase = ctx.content.showcase!;
  const t = TEXT[ctx.locale];
  const words = { yes: t.yes, no: t.no };
  const name = pick(ctx, product.name);
  const url = catalogueUrl(ctx, origin, 'product', product.slug);
  const images = [...product.images, ...product.variants.flatMap((v) => v.images)].flatMap(
    (image) => {
      const share = shareOf(ctx, image, origin);
      return share ? [share.url] : [];
    },
  );
  const category = showcase.categories.find((c) => c.id === product.categoryIds[0]);
  const properties = showcase.attributes.flatMap<Json>((attribute) => {
    const value = product.values[attribute.id];
    const label = pick(ctx, attribute.name);
    if (!value || !label) return [];
    if ('number' in value) {
      return [
        compact({
          '@type': 'PropertyValue',
          name: label,
          value: value.number,
          unitText: attribute.unit,
        }),
      ];
    }
    const text = formatValue(attribute, value, ctx.locale, words);
    return text ? [{ '@type': 'PropertyValue', name: label, value: text }] : [];
  });
  // Only certificates an Owner or Administrator has checked reach the showcase (D-045, D-049).
  const certifications = [...product.documents]
    .filter((d) => d.certificate && ctx.content.files?.[d.fileId])
    .map((d) =>
      compact({
        '@type': 'Certification',
        name: d.certificate!.name,
        certificationIdentification: d.certificate!.number,
        issuedBy: d.certificate!.issuer
          ? { '@type': 'Organization', name: d.certificate!.issuer }
          : undefined,
        expires: d.certificate!.validUntil ?? undefined,
      }),
    );
  const finishName = (id: string | null) => {
    const finish = id ? showcase.finishes.find((f) => f.id === id) : undefined;
    return finish ? pick(ctx, finish.name) : '';
  };
  const coded = product.variants.filter((v) => v.sku);
  const common = {
    '@context': CONTEXT,
    name,
    url,
    description:
      pick(ctx, product.summary) || (paragraphs(pick(ctx, product.description))[0] ?? ''),
    image: images,
    category: category ? pick(ctx, category.name) : '',
    additionalProperty: properties,
    hasCertification: certifications,
  };
  if (coded.length >= 2) {
    const byFinish = coded.every((v) => v.finishId);
    return compact({
      ...common,
      '@type': 'ProductGroup',
      variesBy: byFinish ? 'https://schema.org/color' : undefined,
      hasVariant: coded.map((v) => {
        const finish = finishName(v.finishId);
        const variantName = pick(ctx, v.name) || finish;
        return compact({
          '@type': 'Product',
          name: variantName ? `${name} — ${variantName}` : name,
          sku: v.sku,
          color: finish,
        });
      }),
    });
  }
  return compact({ ...common, '@type': 'Product', sku: coded[0]?.sku ?? '' });
}

/**
 * The website itself, for its home page: WebSite, and an Organization with the contact details
 * and social profiles entered in Website settings → SEO & contact.
 */
export function siteLd(ctx: RenderContext, site: SiteData, origin: string): Json[] {
  const name = site.site.name[ctx.locale] || site.site.name.ar || site.site.name.en;
  const home = ctx.content.index.home;
  const url = `${origin}${home ? pageHref(ctx, home) : '/'}`;
  const { contact, social } = ctx.settings;
  const logo = site.logo ? (site.logo.touchIcon ?? site.logo.lockup) : null;
  return [
    { '@context': CONTEXT, '@type': 'WebSite', name, url, inLanguage: ctx.locale },
    compact({
      '@context': CONTEXT,
      '@type': 'Organization',
      name,
      url,
      logo: logo ? `${origin}${logo}` : undefined,
      email: contact.email,
      telephone: contact.phone,
      address: pick(ctx, contact.address),
      sameAs: Object.values(social).filter(Boolean),
    }),
  ];
}
