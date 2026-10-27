import { z } from 'zod';
import {
  RESERVED_SLUGS,
  bilingual,
  emptyText,
  itemId,
  linkSchema,
  mediaIds,
  slugSchema,
} from './primitives';
import type { Bilingual, Link } from './primitives';
import { contentSectionSchema, sectionSchema } from './registry';

/**
 * A website's structure (D-035, D-037): pages made of sections, the page index (order, home page,
 * redirects), menus, and the header and footer. Each is stored as a site document with drafts and
 * numbered versions; *Publish changes* validates them together with `checkSite`.
 */

export const pageSchema = z.strictObject({
  title: bilingual(120),
  slug: slugSchema,
  /** A page inside another page, one level deep (e.g. /products/switches). */
  parentId: itemId.nullable(),
  /** Hidden pages keep their content but are not built, linked or listed. */
  visible: z.boolean(),
  seo: z.strictObject({
    title: bilingual(70),
    description: bilingual(200),
    /** Ask search engines not to list the page. */
    noindex: z.boolean(),
  }),
  sections: z.array(sectionSchema).max(40),
});
export type Page = z.infer<typeof pageSchema>;

export const pagesIndexSchema = z.strictObject({
  /** Every page of the site, in display order. */
  order: z.array(itemId).max(200),
  home: itemId.nullable(),
  /** Old addresses that lead to a page, kept when a page's address changes. */
  redirects: z
    .array(
      z.strictObject({
        from: z
          .string()
          .regex(/^\/[a-z0-9\-/]*$/)
          .max(200),
        to: itemId,
      }),
    )
    .max(500),
});
export type PagesIndex = z.infer<typeof pagesIndexSchema>;

const menuLeaf = z.strictObject({
  id: itemId,
  label: bilingual(40),
  link: linkSchema,
  visible: z.boolean(),
});
const menuItemSchema = menuLeaf.extend({ children: z.array(menuLeaf).max(12) });
export type MenuItem = z.infer<typeof menuItemSchema>;

export const menusSchema = z.strictObject({
  header: z.array(menuItemSchema).max(12),
  footer: z.array(menuItemSchema).max(12),
});
export type Menus = z.infer<typeof menusSchema>;

export const layoutSchema = z.strictObject({
  header: z.strictObject({
    sticky: z.boolean(),
    showLanguage: z.boolean(),
    showThemeToggle: z.boolean(),
    button: z.strictObject({ label: bilingual(40), link: linkSchema }),
  }),
  footer: z.strictObject({
    text: bilingual(300),
    showContact: z.boolean(),
    showSocial: z.boolean(),
    copyright: bilingual(120),
  }),
});
export type Layout = z.infer<typeof layoutSchema>;

/** The website's saved sections (D-038), reused by reference on any of its pages. */
export const savedSectionsSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: itemId,
        name: bilingual(60),
        section: contentSectionSchema,
      }),
    )
    .max(50),
});
export type SavedSections = z.infer<typeof savedSectionsSchema>;
export type SavedSection = SavedSections['items'][number];
export const DEFAULT_SAVED_SECTIONS: SavedSections = { items: [] };

export const DEFAULT_LAYOUT: Layout = {
  header: {
    sticky: true,
    showLanguage: true,
    showThemeToggle: true,
    button: { label: emptyText(), link: { type: 'none' } },
  },
  footer: { text: emptyText(), showContact: true, showSocial: true, copyright: emptyText() },
};

export const DEFAULT_PAGES_INDEX: PagesIndex = { order: [], home: null, redirects: [] };
export const DEFAULT_MENUS: Menus = { header: [], footer: [] };

/** A new, empty page. */
export function newPage(title: Bilingual, slug: string): Page {
  return {
    title,
    slug,
    parentId: null,
    visible: true,
    seo: { title: emptyText(), description: emptyText(), noindex: false },
    sections: [],
  };
}

/* ---------------------------------------- Addresses ---------------------------------------- */

/** A page's address without the language prefix: "/" for the home page, "/about", "/products/switches". */
export function pagePath(id: string, pages: Map<string, Page>, home: string | null): string {
  if (id === home) return '/';
  const page = pages.get(id);
  if (!page) return '/';
  const parent = page.parentId ? pages.get(page.parentId) : undefined;
  return parent ? `/${parent.slug}/${page.slug}` : `/${page.slug}`;
}

/** The address in one language: the default language has no prefix, others start with /en etc. */
export const localizedPath = (path: string, locale: string, defaultLocale: string) =>
  locale === defaultLocale ? path : path === '/' ? `/${locale}/` : `/${locale}${path}`;

/* ------------------------------------------ Checks ------------------------------------------ */

export interface SiteIssue {
  code:
    | 'no-home'
    | 'home-hidden'
    | 'duplicate-address'
    | 'reserved-address'
    | 'missing-parent'
    | 'nested-too-deep'
    | 'missing-title'
    | 'broken-link'
    | 'missing-saved-section'
    | 'missing-image';
  /** The page or menu item concerned. */
  target: string;
  detail?: string;
}

export interface SiteDraft {
  index: PagesIndex;
  pages: Map<string, Page>;
  menus: Menus;
  layout: Layout;
  /** Saved sections the pages may reference; none when left out. */
  saved?: SavedSections;
  locales: readonly string[];
  /** The website's media library images; when given, images that no longer exist are reported. */
  media?: ReadonlySet<string>;
}

/**
 * Cross-checks run before publishing (D-037): a visible home page, unique addresses, no
 * platform-reserved addresses, titles in every language the site uses, and links only to pages
 * that will be public.
 */
export function checkSite(site: SiteDraft): SiteIssue[] {
  const issues: SiteIssue[] = [];
  const { index, pages } = site;
  const live = (pageId: string) =>
    index.order.includes(pageId) && pages.get(pageId)?.visible === true;

  if (!index.home || !pages.has(index.home)) issues.push({ code: 'no-home', target: 'index' });
  else if (!live(index.home)) issues.push({ code: 'home-hidden', target: index.home });

  const seen = new Map<string, string>();
  for (const pageId of index.order) {
    const page = pages.get(pageId);
    if (!page) continue;
    if (page.parentId) {
      const parent = pages.get(page.parentId);
      if (!parent || !index.order.includes(page.parentId)) {
        issues.push({ code: 'missing-parent', target: pageId });
      } else if (parent.parentId) {
        issues.push({ code: 'nested-too-deep', target: pageId });
      }
    } else if ((RESERVED_SLUGS as readonly string[]).includes(page.slug)) {
      issues.push({ code: 'reserved-address', target: pageId, detail: page.slug });
    }
    for (const locale of site.locales) {
      if (page.title[locale as keyof Bilingual].trim() === '') {
        issues.push({ code: 'missing-title', target: pageId, detail: locale });
      }
    }
    if (!page.visible) continue;
    const path = pagePath(pageId, pages, index.home);
    const other = seen.get(path);
    if (other) issues.push({ code: 'duplicate-address', target: pageId, detail: path });
    else seen.set(path, pageId);
  }

  const checkLink = (link: Link, target: string) => {
    if (link.type === 'page' && !live(link.pageId)) {
      issues.push({ code: 'broken-link', target, detail: link.pageId });
    }
  };
  for (const [area, items] of Object.entries(site.menus)) {
    for (const item of items) {
      if (!item.visible) continue;
      checkLink(item.link, `menu:${area}:${item.id}`);
      for (const child of item.children) {
        if (child.visible) checkLink(child.link, `menu:${area}:${child.id}`);
      }
    }
  }
  checkLink(site.layout.header.button.link, 'layout:header');
  const saved = new Map((site.saved?.items ?? []).map((item) => [item.id, item]));
  const used = new Set<string>();
  for (const pageId of index.order) {
    const page = pages.get(pageId);
    if (!page?.visible) continue;
    for (const link of linksIn(page)) checkLink(link, `page:${pageId}`);
    for (const section of page.sections) {
      if (section.type !== 'saved') continue;
      if (saved.has(section.settings.savedId)) used.add(section.settings.savedId);
      else issues.push({ code: 'missing-saved-section', target: `page:${pageId}` });
    }
  }
  // Links inside saved sections count wherever a public page uses them.
  for (const savedId of used) {
    const item = saved.get(savedId);
    if (item) for (const link of linksInSection(item.section)) checkLink(link, `saved:${savedId}`);
  }
  if (site.media) {
    const checkImages = (value: unknown, target: string) => {
      for (const mediaId of mediaIds(value)) {
        if (!site.media?.has(mediaId))
          issues.push({ code: 'missing-image', target, detail: mediaId });
      }
    };
    for (const pageId of index.order) {
      const page = pages.get(pageId);
      if (page?.visible) checkImages(page, `page:${pageId}`);
    }
    for (const savedId of used) checkImages(saved.get(savedId), `saved:${savedId}`);
  }
  return issues;
}

/** Every link a page's sections contain. */
export function linksIn(page: Page): Link[] {
  return page.sections.flatMap(linksInSection);
}

/** Every link one section's settings contain. */
export function linksInSection(section: { settings: unknown }): Link[] {
  const links: Link[] = [];
  for (const value of Object.values(section.settings as Record<string, unknown>)) {
    collect(value, links);
  }
  return links;
}

function collect(value: unknown, links: Link[]) {
  if (Array.isArray(value)) {
    for (const v of value) collect(v, links);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;
  if (
    typeof record['type'] === 'string' &&
    ['none', 'page', 'url', 'section'].includes(record['type'])
  ) {
    const parsed = linkSchema.safeParse(record);
    if (parsed.success) links.push(parsed.data);
    return;
  }
  for (const v of Object.values(record)) collect(v, links);
}
