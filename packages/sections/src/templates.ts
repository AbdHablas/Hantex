import type { SiteStarter } from '@hantex/shared';
import type { Bilingual } from './primitives';
import { newId, newSection, type Section } from './registry';
import {
  DEFAULT_LAYOUT,
  newPage,
  type Layout,
  type MenuItem,
  type Menus,
  type Page,
  type PagesIndex,
} from './site';

/**
 * Platform templates (D-038): starting structures copied into a website when it is created.
 * Later changes to a template never change existing websites. Templates hold structure only:
 * page names, sections and menus. Texts start empty (the hero shows the website's name), so
 * nothing factual is invented for any brand.
 */

export { SITE_STARTERS, type SiteStarter } from '@hantex/shared';

export const STARTER_INFO: Record<SiteStarter, { name: Bilingual; description: Bilingual }> = {
  blank: {
    name: { en: 'Blank', ar: 'فارغ' },
    description: { en: 'A home page only.', ar: 'صفحة رئيسية فقط.' },
  },
  business: {
    name: { en: 'Business', ar: 'نشاط تجاري' },
    description: {
      en: 'Home, About us and Contact pages with menus.',
      ar: 'الصفحة الرئيسية ومن نحن وتواصل معنا مع القوائم.',
    },
  },
  'product-brand': {
    name: { en: 'Product brand', ar: 'علامة منتجات' },
    description: {
      en: 'Home, Products, About us, FAQ and Contact; product sections added with the catalogue.',
      ar: 'الرئيسية والمنتجات ومن نحن والأسئلة الشائعة وتواصل معنا؛ تُضاف أقسام المنتجات مع الكتالوج.',
    },
  },
};

export interface SiteContent {
  index: PagesIndex;
  pages: Record<string, Page>;
  menus: Menus;
  layout: Layout;
}

const T = (en: string, ar: string): Bilingual => ({ en, ar });

function page(title: Bilingual, slug: string, sections: Section[]): [string, Page] {
  return [newId(), { ...newPage(title, slug), sections }];
}

function hero(siteName: Bilingual): Section {
  const section = newSection('hero');
  section.settings.heading = { ...siteName };
  return section;
}

const link = (id: string, label: Bilingual): MenuItem => ({
  id: newId(),
  label,
  link: { type: 'page', pageId: id },
  visible: true,
  children: [],
});

/** A website's starting pages, menus and layout from a template. */
export function starterContent(starter: SiteStarter, siteName: Bilingual): SiteContent {
  const home = page(T('Home', 'الرئيسية'), 'home', [hero(siteName)]);
  const entries: [string, Page][] = [home];
  if (starter !== 'blank') {
    if (starter === 'product-brand') {
      home[1].sections.push(newSection('cards'), newSection('features'), newSection('newsletter'));
      entries.push(page(T('Products', 'المنتجات'), 'products', [newSection('cards')]));
    }
    entries.push(page(T('About us', 'من نحن'), 'about', [newSection('richText')]));
    if (starter === 'product-brand') {
      entries.push(page(T('Questions', 'الأسئلة الشائعة'), 'faq', [newSection('faq')]));
    }
    entries.push(page(T('Contact', 'تواصل معنا'), 'contact', [newSection('contact')]));
  }
  const menuItems = entries.map(([id, p]) => link(id, p.title));
  return {
    index: { order: entries.map(([id]) => id), home: home[0], redirects: [] },
    pages: Object.fromEntries(entries),
    menus: {
      header: menuItems,
      footer: menuItems.map((item) => ({ ...item, id: newId() })),
    },
    layout: structuredClone(DEFAULT_LAYOUT),
  };
}
