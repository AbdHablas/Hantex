import type { Locale, SiteSettings } from '@hantex/shared';
import {
  localizedPath,
  pagePath,
  type Bilingual,
  type ContentSection,
  type ImageRef,
  type Link,
  type MediaInfo,
  type Page,
} from '@hantex/sections';
import type { BuilderContent } from './site-data';

/**
 * Rendering helpers for the website builder's pages (D-035): addresses, links and text in the
 * page's language. Shared by the published pages and the dashboard's draft previews.
 */
export interface RenderContext {
  locale: Locale;
  locales: readonly Locale[];
  defaultLocale: Locale;
  content: BuilderContent;
  pages: Map<string, Page>;
  settings: SiteSettings;
  /** Draft previews: links don't leave the preview and forms don't send. */
  preview: boolean;
}

export function renderContext(options: Omit<RenderContext, 'pages'>): RenderContext {
  return { ...options, pages: new Map(Object.entries(options.content.pages)) };
}

/** A media library image as drawn: its size, alternative text and every stored width. */
export interface Picture {
  src: string;
  srcset: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * The address of one stored width of an image (D-044): `/media/<id>/<width>.webp` once it is
 * published, or a signed, short-lived link to a preview copy in draft previews.
 */
export function mediaSrc(id: string, info: MediaInfo, width: number): string {
  if (!info.preview) return `/media/${id}/${width}.webp`;
  const { expires, signature } = info.preview;
  return `/media/preview/${id}/${width}.webp?expires=${expires}&signature=${signature}`;
}

/** An image ready to draw, or null when none is chosen or it isn't available. */
export function pictureOf(ctx: RenderContext, image: ImageRef): Picture | null {
  if (!image) return null;
  const info = ctx.content.media?.[image.mediaId];
  if (!info) return null;
  const widths = [...info.widths].sort((a, b) => a - b);
  // A middle width for browsers that ignore srcset; srcset lets the others pick.
  const fallback = widths.find((w) => w >= 960) ?? widths.at(-1)!;
  return {
    src: mediaSrc(image.mediaId, info, fallback),
    srcset: widths.map((w) => `${mediaSrc(image.mediaId, info, w)} ${w}w`).join(', '),
    width: info.width,
    height: info.height,
    alt: pick(ctx, info.alt),
  };
}

/** Pages a visitor can open: listed in the index and visible. */
export const isLive = (ctx: Pick<RenderContext, 'content'>, id: string) =>
  ctx.content.index.order.includes(id) && ctx.content.pages[id]?.visible === true;

/**
 * A page's address in one language, e.g. "/", "/about/" or "/en/products/switches/". Pages are
 * built as folders, so their addresses end with a slash like the Coming Soon page's "/en/".
 */
export function pageHref(ctx: RenderContext, id: string, locale: Locale = ctx.locale): string {
  return withSlash(
    localizedPath(pagePath(id, ctx.pages, ctx.content.index.home), locale, ctx.defaultLocale),
  );
}

export const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`);

/** Text in the page's language, trimmed; an empty text hides its element. */
export const pick = (ctx: Pick<RenderContext, 'locale'>, value: Bilingual) =>
  value[ctx.locale].trim();

export interface Href {
  href: string;
  external: boolean;
}

/** Where a button or menu item leads, or null when it leads nowhere (or to a hidden page). */
export function hrefOf(ctx: RenderContext, link: Link): Href | null {
  switch (link.type) {
    case 'none':
      return null;
    case 'page':
      return isLive(ctx, link.pageId)
        ? { href: pageHref(ctx, link.pageId), external: false }
        : null;
    case 'section':
      return { href: `#${link.anchor}`, external: false };
    case 'url':
      return { href: link.url, external: true };
  }
}

/** Every address of a live site: each visible page in each language. */
export function livePaths(ctx: Omit<RenderContext, 'locale'>) {
  return ctx.locales.flatMap((locale) =>
    ctx.content.index.order
      .filter((id) => isLive(ctx, id))
      .map((id) => ({ id, locale, path: pageHref({ ...ctx, locale }, id) })),
  );
}

/**
 * A page's sections as drawn: references to saved sections (D-038) are replaced by the saved
 * section, keeping the reference's id so the same saved section can appear twice. A reference to
 * a saved section that no longer exists draws nothing (Publish changes refuses that anyway).
 */
export function resolveSections(ctx: RenderContext, page: Page): ContentSection[] {
  const saved = new Map((ctx.content.saved?.items ?? []).map((item) => [item.id, item.section]));
  return page.sections.flatMap((section) => {
    if (section.type !== 'saved') return [section];
    const target = saved.get(section.settings.savedId);
    return target ? [{ ...target, id: section.id }] : [];
  });
}
