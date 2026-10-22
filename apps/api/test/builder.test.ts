import { documentVersions, sites, subscribers } from '@hantex/db/worker';
import { newSection, savedReference, type Menus, type Page } from '@hantex/sections';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';

/**
 * The website builder (D-035 to D-038): pages, sections, menus and Publish changes, on websites
 * this test creates for itself so it never touches the other tests' sites.
 */

let h: Harness;
let owner: string;
let viewerAll: string;
let editorAll: string;

const json = async <T>(response: Response) => (await response.json()) as T;
const ONE = 'bt-one';
const TWO = 'bt-two';

interface PageList {
  home: string;
  pages: { id: string; slug: string; visible: boolean; published: boolean; changed: boolean }[];
}

const newSite = (key: string, startFrom?: unknown) => ({
  key,
  name: { ar: `موقع ${key}`, en: `Site ${key}` },
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  template: 'product-showcase',
  ...(startFrom ? { startFrom } : {}),
});

const pages = async (key: string, cookie = owner) =>
  json<PageList>(await h.request('GET', `/api/sites/${key}/pages`, { cookie }));
const page = async (key: string, id: string) =>
  (
    await json<{ page: Page }>(
      await h.request('GET', `/api/sites/${key}/pages/${id}`, { cookie: owner }),
    )
  ).page;
const savePage = (key: string, id: string, body: unknown, cookie = owner) =>
  h.request('PUT', `/api/sites/${key}/pages/${id}`, { cookie, body });
const publishChanges = (key: string, cookie = owner) =>
  h.request('POST', `/api/sites/${key}/changes/publish`, { cookie, body: {} });

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('bt-owner', [{ roleId: 'owner', site: null }]);
  viewerAll = await h.staff('bt-viewer', [{ roleId: 'viewer', site: null }]);
  editorAll = await h.staff('bt-editor', [{ roleId: 'editor', site: null }]);
  expect(
    (
      await h.request('POST', '/api/sites', {
        cookie: owner,
        body: newSite(ONE, { starter: 'business' }),
      })
    ).status,
  ).toBe(201);
  expect(
    (await h.request('POST', '/api/sites', { cookie: owner, body: newSite(TWO) })).status,
  ).toBe(201);
});
afterAll(() => h.close());

describe('creating websites', () => {
  it('starts a website from a template, and a blank one with a home page only', async () => {
    const one = await pages(ONE);
    expect(one.pages.map((p) => p.slug)).toEqual(['home', 'about', 'contact']);
    expect(one.home).toBe(one.pages[0]?.id);
    const menus = await json<Menus>(
      await h.request('GET', `/api/sites/${ONE}/menus`, { cookie: owner }),
    );
    expect(menus.header).toHaveLength(3);
    expect((await pages(TWO)).pages.map((p) => p.slug)).toEqual(['home']);
  });

  it('duplicates a website: pages, menus and settings, never sign-ups', async () => {
    const [one] = await h.db.select().from(sites).where(eq(sites.key, ONE));
    await h.db.insert(subscribers).values({
      siteId: one!.id,
      contactType: 'email',
      contactValue: 'copy-check@example.test',
      locale: 'ar',
      consentVersion: 'v1',
    });
    const created = await h.request('POST', '/api/sites', {
      cookie: owner,
      body: newSite('bt-copy', { duplicate: ONE }),
    });
    expect(created.status).toBe(201);
    expect((await pages('bt-copy')).pages.map((p) => p.slug)).toEqual(['home', 'about', 'contact']);
    const [copy] = await h.db.select().from(sites).where(eq(sites.key, 'bt-copy'));
    expect(await h.db.select().from(subscribers).where(eq(subscribers.siteId, copy!.id))).toEqual(
      [],
    );
    // Duplicating needs access to the source website.
    const adminTwo = await h.staff('bt-admin-two', [{ roleId: 'administrator', site: null }]);
    expect(
      (
        await h.request('POST', '/api/sites', {
          cookie: adminTwo,
          body: newSite('bt-x', { duplicate: ONE }),
        })
      ).status,
    ).toBe(403);
  });
});

describe('pages', () => {
  it('creates, duplicates (hidden, with a free address), reorders and deletes pages', async () => {
    const created = await h.request('POST', `/api/sites/${ONE}/pages`, {
      cookie: owner,
      body: { title: { ar: 'الخدمات', en: 'Services' }, slug: 'about' },
    });
    expect(created.status).toBe(201);
    const { id, slug } = await json<{ id: string; slug: string }>(created);
    expect(slug).toBe('about-2');

    const copy = await json<{ id: string }>(
      await h.request('POST', `/api/sites/${ONE}/pages/${id}/duplicate`, { cookie: owner }),
    );
    const listed = await pages(ONE);
    const copied = listed.pages.find((p) => p.id === copy.id);
    expect(copied?.visible).toBe(false);
    expect(listed.pages.map((p) => p.id).indexOf(copy.id)).toBe(
      listed.pages.map((p) => p.id).indexOf(id) + 1,
    );

    const order = [...listed.pages.map((p) => p.id)].reverse();
    expect(
      (
        await h.request('PUT', `/api/sites/${ONE}/pages-index`, {
          cookie: owner,
          body: { order, home: listed.home },
        })
      ).status,
    ).toBe(200);
    expect((await pages(ONE)).pages.map((p) => p.id)).toEqual(order);
    // Reordering can't add or drop pages.
    expect(
      (
        await h.request('PUT', `/api/sites/${ONE}/pages-index`, {
          cookie: owner,
          body: { order: order.slice(1), home: listed.home },
        })
      ).status,
    ).toBe(400);

    expect(
      (await h.request('DELETE', `/api/sites/${ONE}/pages/${listed.home}`, { cookie: owner }))
        .status,
    ).toBe(409);
    for (const pageId of [copy.id, id]) {
      expect(
        (await h.request('DELETE', `/api/sites/${ONE}/pages/${pageId}`, { cookie: owner })).status,
      ).toBe(200);
    }
    expect((await pages(ONE)).pages).toHaveLength(3);
  });

  it('accepts sections from the registry only, with validated settings', async () => {
    const { home } = await pages(ONE);
    const current = await page(ONE, home);
    const cta = newSection('cta');
    cta.settings.heading = { ar: 'تواصل معنا', en: 'Talk to us' };
    expect(
      (await savePage(ONE, home, { ...current, sections: [...current.sections, cta] })).status,
    ).toBe(200);
    expect((await page(ONE, home)).sections.map((s) => s.type)).toContain('cta');

    const script = {
      ...newSection('richText'),
      type: 'html',
      settings: { html: '<script></script>' },
    };
    expect((await savePage(ONE, home, { ...current, sections: [script] })).status).toBe(400);
    const evilLink = newSection('cta');
    evilLink.settings.button.link = { type: 'url', url: 'javascript:alert(1)' };
    expect((await savePage(ONE, home, { ...current, sections: [evilLink] })).status).toBe(400);
  });

  it('keeps each website separate: another site never shows or changes these pages', async () => {
    const { home } = await pages(ONE);
    expect(
      (await h.request('GET', `/api/sites/${TWO}/pages/${home}`, { cookie: owner })).status,
    ).toBe(404);
    const before = await page(ONE, home);
    expect((await savePage(TWO, home, before)).status).toBe(404);
    // Per-site staff of the other website can't even open this one.
    const adminB = await h.staff('bt-admin-b', [{ roleId: 'administrator', site: 'b' }]);
    expect((await h.request('GET', `/api/sites/${ONE}/pages`, { cookie: adminB })).status).toBe(
      404,
    );
  });

  it('follows the roles: viewers read, editors draft, only publishers publish', async () => {
    const { home } = await pages(ONE);
    expect((await h.request('GET', `/api/sites/${ONE}/pages`, { cookie: viewerAll })).status).toBe(
      200,
    );
    expect(
      (
        await h.request('POST', `/api/sites/${ONE}/pages`, {
          cookie: viewerAll,
          body: { title: { ar: 'x', en: 'x' }, slug: 'x' },
        })
      ).status,
    ).toBe(403);
    expect((await savePage(ONE, home, await page(ONE, home), editorAll)).status).toBe(200);
    expect((await publishChanges(ONE, editorAll)).status).toBe(403);
  });
});

describe('Publish changes (D-037)', () => {
  it('refuses a site with broken links, then publishes everything together with one rebuild', async () => {
    const listed = await pages(ONE);
    const about = listed.pages.find((p) => p.slug === 'about')!;
    const aboutPage = await page(ONE, about.id);
    // The header menu links to About; hiding About breaks that link.
    expect((await savePage(ONE, about.id, { ...aboutPage, visible: false })).status).toBe(200);
    const refused = await publishChanges(ONE);
    expect(refused.status).toBe(409);
    const body = await json<{ details: { issues: { code: string }[] } }>(refused);
    expect(body.details.issues.map((i) => i.code)).toContain('broken-link');

    expect((await savePage(ONE, about.id, aboutPage)).status).toBe(200);
    const changes = await json<{ items: { kind: string }[]; issues: unknown[] }>(
      await h.request('GET', `/api/sites/${ONE}/changes`, { cookie: owner }),
    );
    expect(changes.issues).toEqual([]);
    expect(changes.items.map((i) => i.kind)).toEqual(
      expect.arrayContaining(['page', 'pages', 'menus', 'layout']),
    );

    h.dispatched.length = 0;
    const published = await publishChanges(ONE);
    expect(published.status).toBe(200);
    expect(h.dispatched.map((d) => d.siteKey)).toEqual([ONE]);
    expect((await pages(ONE)).pages.every((p) => p.published && !p.changed)).toBe(true);
    expect((await publishChanges(ONE)).status).toBe(409);
  });

  it('redirects a published page’s old address when it changes', async () => {
    const about = (await pages(ONE)).pages.find((p) => p.slug === 'about')!;
    const aboutPage = await page(ONE, about.id);
    expect((await savePage(ONE, about.id, { ...aboutPage, slug: 'who-we-are' })).status).toBe(200);
    expect((await publishChanges(ONE)).status).toBe(200);
    const [site] = await h.db.select().from(sites).where(eq(sites.key, ONE));
    const versions = await h.db
      .select()
      .from(documentVersions)
      .where(and(eq(documentVersions.siteId, site!.id), eq(documentVersions.kind, 'pages')));
    const latest = versions.sort((a, b) => b.version - a.version)[0]!.data as {
      redirects: { from: string; to: string }[];
    };
    expect(latest.redirects).toContainEqual({ from: '/about', to: about.id });
  });

  it('restores an earlier page version into the draft', async () => {
    const about = (await pages(ONE)).pages.find((p) => p.slug === 'who-we-are')!;
    const versions = await json<{ version: number }[]>(
      await h.request('GET', `/api/sites/${ONE}/pages/${about.id}/versions`, { cookie: owner }),
    );
    const first = versions.at(-1)!.version;
    expect(
      (
        await h.request('POST', `/api/sites/${ONE}/pages/${about.id}/restore`, {
          cookie: owner,
          body: { version: first },
        })
      ).status,
    ).toBe(200);
    expect((await page(ONE, about.id)).slug).toBe('about');
  });

  it('publishes saved sections with the pages that use them, and refuses missing ones', async () => {
    const { home } = await pages(ONE);
    const homePage = await page(ONE, home);
    const cta = newSection('cta');
    cta.settings.heading = { ar: 'مشترك', en: 'Shared' };
    expect(
      (
        await h.request('PUT', `/api/sites/${ONE}/saved-sections`, {
          cookie: owner,
          body: { items: [{ id: 'shared01', name: { ar: 'م', en: 'm' }, section: cta }] },
        })
      ).status,
    ).toBe(200);
    // A reference to a saved section that doesn't exist blocks publishing.
    const missing = { ...homePage, sections: [...homePage.sections, savedReference('gone0001')] };
    expect((await savePage(ONE, home, missing)).status).toBe(200);
    const refused = await publishChanges(ONE);
    expect(refused.status).toBe(409);
    const body = await json<{ details: { issues: { code: string }[] } }>(refused);
    expect(body.details.issues.map((i) => i.code)).toContain('missing-saved-section');

    const using = { ...homePage, sections: [...homePage.sections, savedReference('shared01')] };
    expect((await savePage(ONE, home, using)).status).toBe(200);
    expect((await publishChanges(ONE)).status).toBe(200);
    const [site] = await h.db.select().from(sites).where(eq(sites.key, ONE));
    const saved = await h.db
      .select()
      .from(documentVersions)
      .where(
        and(eq(documentVersions.siteId, site!.id), eq(documentVersions.kind, 'saved-sections')),
      );
    expect(saved).toHaveLength(1);
    // Another website can't read them.
    expect(
      (await h.request('GET', `/api/sites/${TWO}/saved-sections`, { cookie: owner })).status,
    ).toBe(200);
    expect(
      await json<{ items: unknown[] }>(
        await h.request('GET', `/api/sites/${TWO}/saved-sections`, { cookie: owner }),
      ),
    ).toEqual({ items: [] });
  });

  it('starts a privacy policy page from the draft for review, hidden (D-041)', async () => {
    const created = await h.request('POST', `/api/sites/${ONE}/pages`, {
      cookie: owner,
      body: {
        title: { ar: 'سياسة الخصوصية', en: 'Privacy policy' },
        slug: 'privacy',
        template: 'privacy-draft',
      },
    });
    expect(created.status).toBe(201);
    const { id } = await json<{ id: string }>(created);
    const draft = await page(ONE, id);
    expect(draft.visible).toBe(false);
    expect(JSON.stringify(draft.sections)).toContain('DRAFT FOR REVIEW');
    expect(JSON.stringify(draft.sections)).toContain(`Site ${ONE}`);
  });
});
