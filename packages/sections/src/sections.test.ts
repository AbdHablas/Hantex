import { describe, expect, it } from 'vitest';
import {
  SECTIONS,
  SECTION_TYPES,
  checkSite,
  localizedPath,
  mediaIds,
  menusSchema,
  newPage,
  newSection,
  pagePath,
  pageSchema,
  privacyPolicyDraft,
  pagesIndexSchema,
  richDocSchema,
  savedReference,
  savedSectionsSchema,
  sectionSchema,
  starterContent,
  SITE_STARTERS,
  type Page,
  type SiteDraft,
} from './index';

const siteName = { ar: 'هانتكس ألترا', en: 'Hantex Ultra' };

describe('section registry', () => {
  it('gives every section type valid defaults', () => {
    for (const type of SECTION_TYPES) {
      const section = newSection(type);
      expect(sectionSchema.safeParse(section).success, type).toBe(true);
      expect(SECTIONS[type].schema.safeParse(SECTIONS[type].defaults()).success, type).toBe(true);
    }
  });

  it('refuses unknown section types and settings outside the schema', () => {
    const unknown = { ...newSection('hero'), type: 'script' };
    expect(sectionSchema.safeParse(unknown).success).toBe(false);
    const extra = newSection('hero') as unknown as { settings: Record<string, unknown> };
    extra.settings['html'] = '<script>alert(1)</script>';
    expect(sectionSchema.safeParse(extra).success).toBe(false);
    const style = newSection('cta') as unknown as { style: Record<string, unknown> };
    style.style['background'] = 'url(javascript:alert(1))';
    expect(sectionSchema.safeParse(style).success).toBe(false);
  });

  it('only allows safe links in buttons', () => {
    const section = newSection('cta');
    section.settings.button.link = { type: 'url', url: 'javascript:alert(1)' };
    expect(sectionSchema.safeParse(section).success).toBe(false);
    section.settings.button.link = { type: 'url', url: 'https://example.com/x' };
    expect(sectionSchema.safeParse(section).success).toBe(true);
  });
});

describe('rich text', () => {
  it('accepts paragraphs, headings, lists and safe links', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            {
              type: 'text',
              text: 'link',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
            },
          ],
        },
      ],
    };
    expect(richDocSchema.safeParse(doc).success).toBe(true);
  });

  it('refuses HTML, scripts in links and unknown nodes or marks', () => {
    const bad = (content: unknown[]) => richDocSchema.safeParse({ type: 'doc', content }).success;
    expect(bad([{ type: 'html', content: '<b>x</b>' }])).toBe(false);
    expect(
      bad([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ]),
    ).toBe(false);
    expect(
      bad([
        { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'code' }] }] },
      ]),
    ).toBe(false);
    expect(bad([{ type: 'heading', attrs: { level: 1 }, content: [] }])).toBe(false);
  });
});

const draft = (
  pages: [string, Page][],
  home: string | null = pages[0]?.[0] ?? null,
): SiteDraft => ({
  index: { order: pages.map(([id]) => id), home, redirects: [] },
  pages: new Map(pages),
  menus: { header: [], footer: [] },
  layout: starterContent('blank', siteName).layout,
  locales: ['ar', 'en'],
});

describe('site checks', () => {
  const page = (slug: string, extra: Partial<Page> = {}): Page => ({
    ...newPage({ ar: slug, en: slug }, slug),
    ...extra,
  });

  it('accepts every starter template', () => {
    for (const starter of SITE_STARTERS) {
      const content = starterContent(starter, siteName);
      expect(pagesIndexSchema.safeParse(content.index).success, starter).toBe(true);
      expect(menusSchema.safeParse(content.menus).success, starter).toBe(true);
      for (const p of Object.values(content.pages)) {
        expect(pageSchema.safeParse(p).success, starter).toBe(true);
      }
      const issues = checkSite({
        ...content,
        pages: new Map(Object.entries(content.pages)),
        locales: ['ar', 'en'],
      });
      expect(issues, starter).toEqual([]);
    }
  });

  it('needs a visible home page', () => {
    expect(checkSite(draft([['home00', page('home')]], null)).map((i) => i.code)).toContain(
      'no-home',
    );
    expect(
      checkSite(draft([['home00', page('home', { visible: false })]])).map((i) => i.code),
    ).toContain('home-hidden');
  });

  it('refuses duplicate and reserved addresses, and pages nested too deep', () => {
    const issues = checkSite(
      draft([
        ['home00', page('home')],
        ['about1', page('about')],
        ['about2', page('about')],
        ['api000', page('api')],
        ['parent', page('parent')],
        ['child0', page('child', { parentId: 'parent' })],
        ['grand0', page('grand', { parentId: 'child0' })],
      ]),
    ).map((i) => `${i.code}:${i.target}`);
    expect(issues).toContain('duplicate-address:about2');
    expect(issues).toContain('reserved-address:api000');
    expect(issues).toContain('nested-too-deep:grand0');
    expect(issues).not.toContain('nested-too-deep:child0');
  });

  it('needs a title in every language the site uses', () => {
    const issues = checkSite(
      draft([['home00', page('home', { title: { ar: 'الرئيسية', en: '' } })]]),
    );
    expect(issues).toContainEqual({ code: 'missing-title', target: 'home00', detail: 'en' });
  });

  it('finds links in menus and sections to pages that are hidden or gone', () => {
    const site = draft([
      ['home00', page('home')],
      ['hidden', page('hidden', { visible: false })],
    ]);
    site.menus.header.push({
      id: 'menu01',
      label: { ar: 'م', en: 'm' },
      link: { type: 'page', pageId: 'hidden' },
      visible: true,
      children: [],
    });
    const cta = newSection('cta');
    cta.settings.button.link = { type: 'page', pageId: 'gone00' };
    site.pages.get('home00')!.sections.push(cta);
    const targets = checkSite(site)
      .filter((i) => i.code === 'broken-link')
      .map((i) => i.target);
    expect(targets).toEqual(['menu:header:menu01', 'page:home00']);
  });

  it('builds addresses per language, the home page at the root', () => {
    const pages = new Map<string, Page>([
      ['home00', page('home')],
      ['prod00', page('products')],
      ['switch', page('switches', { parentId: 'prod00' })],
    ]);
    expect(pagePath('home00', pages, 'home00')).toBe('/');
    expect(pagePath('switch', pages, 'home00')).toBe('/products/switches');
    expect(localizedPath('/products', 'en', 'ar')).toBe('/en/products');
    expect(localizedPath('/', 'en', 'ar')).toBe('/en/');
    expect(localizedPath('/products', 'ar', 'ar')).toBe('/products');
  });

  it('checks saved sections: references must exist, and their links count where they are used', () => {
    const site = draft([
      ['home00', page('home')],
      ['hidden', page('hidden', { visible: false })],
    ]);
    const cta = newSection('cta');
    cta.settings.button.link = { type: 'page', pageId: 'hidden' };
    site.saved = { items: [{ id: 'saved1', name: { ar: 'م', en: 'm' }, section: cta }] };
    expect(savedSectionsSchema.safeParse(site.saved).success).toBe(true);
    // Unused, its broken link doesn't matter yet.
    expect(checkSite(site)).toEqual([]);
    site.pages.get('home00')!.sections.push(savedReference('saved1'), savedReference('gone00'));
    expect(checkSite(site).map((i) => `${i.code}:${i.target}`)).toEqual([
      'missing-saved-section:page:home00',
      'broken-link:saved:saved1',
    ]);
    // A saved section can't hold another reference.
    const nested = {
      items: [{ id: 'saved2', name: { ar: 'م', en: 'm' }, section: savedReference('saved1') }],
    };
    expect(savedSectionsSchema.safeParse(nested).success).toBe(false);
  });
});

describe('privacy policy draft (D-041)', () => {
  it('is a valid, hidden page in both languages, marked as a draft with placeholders', () => {
    const page = privacyPolicyDraft(siteName);
    expect(pageSchema.safeParse(page).success).toBe(true);
    expect(page.visible).toBe(false);
    const section = page.sections[0]!;
    if (section.type !== 'richText') throw new Error('expected rich text');
    const en = JSON.stringify(section.settings.body.en);
    const ar = JSON.stringify(section.settings.body.ar);
    expect(en).toContain('DRAFT FOR REVIEW');
    expect(en).toContain('[company legal name]');
    expect(en).toContain('Hantex Ultra');
    expect(ar).toContain('مسودة للمراجعة');
    expect(ar).toContain('هانتكس ألترا');
  });
});

describe('media library images', () => {
  const A = '0b6f5d0e-3c1a-4c2e-9a51-2f4d8e7b6a10';
  const B = '1b6f5d0e-3c1a-4c2e-9a51-2f4d8e7b6a10';
  const withImages = (): Page => {
    const image = newSection('image');
    image.settings.image = { mediaId: A };
    const gallery = newSection('gallery');
    gallery.settings.items[0]!.image = { mediaId: B.toUpperCase() };
    return { ...newPage({ ar: 'ص', en: 'P' }, 'home'), sections: [image, gallery] };
  };

  it('finds every image some content uses, and nothing else', () => {
    expect([...mediaIds(withImages())].sort()).toEqual([A, B]);
    // Text that happens to look like an id is not an image.
    const text = newSection('richText');
    text.settings.title = { ar: A, en: A };
    expect(mediaIds(text).size).toBe(0);
    expect(mediaIds({ mediaId: 'not-an-id' }).size).toBe(0);
  });

  it('accepts sections without an image yet, and refuses anything but a media id', () => {
    expect(sectionSchema.safeParse(newSection('imageText')).success).toBe(true);
    const bad = newSection('image') as { settings: { image: unknown } };
    bad.settings.image = { mediaId: 'https://example.com/x.png' };
    expect(sectionSchema.safeParse(bad).success).toBe(false);
    bad.settings.image = { mediaId: A, src: '/x.png' };
    expect(sectionSchema.safeParse(bad).success).toBe(false);
  });

  it('reports published pages that use images missing from the library', () => {
    const site = draft([['home00', withImages()]]);
    expect(checkSite(site).map((i) => i.code)).not.toContain('missing-image');
    const issues = checkSite({ ...site, media: new Set([A]) });
    expect(issues).toEqual([{ code: 'missing-image', target: 'page:home00', detail: B }]);
    expect(checkSite({ ...site, media: new Set([A, B]) })).toEqual([]);
  });
});
