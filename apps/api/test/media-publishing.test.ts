import { mediaAssets } from '@hantex/db/worker';
import { newSection, type Page } from '@hantex/sections';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hmacHex } from '../src/lib/crypto';
import { fakeWebp } from './fixtures';
import { createHarness, env, type Harness } from './harness';

/**
 * Media library images on the websites (D-044): copied to the public bucket when published pages
 * use them, shown in previews through signed links, and kept while any page uses them.
 */

let h: Harness;
let owner: string;
const SITE = 'mp-one';
const json = async <T>(response: Response) => (await response.json()) as T;

async function uploadImage(): Promise<string> {
  const form = new FormData();
  form.set('meta', JSON.stringify({ name: 'plate.jpg', alt: { ar: 'مفتاح', en: 'A switch' } }));
  form.set('w480', new Blob([fakeWebp(480, 320)], { type: 'image/webp' }), 'w480.webp');
  form.set('w960', new Blob([fakeWebp(960, 640)], { type: 'image/webp' }), 'w960.webp');
  const response = await h.request('POST', `/api/sites/${SITE}/media`, {
    cookie: owner,
    body: form,
  });
  expect(response.status, h.errors.at(-1)).toBe(201);
  return (await json<{ id: string }>(response)).id;
}

async function homePage() {
  const list = await json<{ home: string }>(
    await h.request('GET', `/api/sites/${SITE}/pages`, { cookie: owner }),
  );
  const { page } = await json<{ page: Page }>(
    await h.request('GET', `/api/sites/${SITE}/pages/${list.home}`, { cookie: owner }),
  );
  return { id: list.home, page };
}

/** Puts an image section using `mediaId` first on the home page's draft. */
async function useOnHome(mediaId: string | null) {
  const { id, page } = await homePage();
  const section = newSection('image');
  section.settings.image = mediaId ? { mediaId } : null;
  const sections = [section, ...page.sections.filter((s) => s.type !== 'image')];
  const saved = await h.request('PUT', `/api/sites/${SITE}/pages/${id}`, {
    cookie: owner,
    body: { ...page, sections },
  });
  expect(saved.status, await saved.clone().text()).toBe(200);
  return id;
}

const publish = () =>
  h.request('POST', `/api/sites/${SITE}/changes/publish`, { cookie: owner, body: {} });
const remove = (id: string) =>
  h.request('DELETE', `/api/sites/${SITE}/media/${id}`, { cookie: owner });
const publicKeys = (id: string) => [...h.publicMedia.files.keys()].filter((k) => k.includes(id));

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('mp-owner', [{ roleId: 'owner', site: null }]);
  const created = await h.request('POST', '/api/sites', {
    cookie: owner,
    body: {
      key: SITE,
      name: { ar: 'موقع', en: 'Site' },
      locales: ['ar', 'en'],
      defaultLocale: 'ar',
      template: 'product-showcase',
      startFrom: { starter: 'business' },
    },
  });
  expect(created.status).toBe(201);
  const domain = await h.request('POST', `/api/sites/${SITE}/domains`, {
    cookie: owner,
    body: { hostname: 'mp-one.example.com', isPrimary: true },
  });
  expect(domain.status, await domain.clone().text()).toBeLessThan(300);
});
afterAll(() => h.close());

describe('images on the websites', () => {
  it('copies an image to the public bucket only when published pages use it', async () => {
    const id = await uploadImage();
    await useOnHome(id);
    // A draft alone doesn't make an image public.
    expect(publicKeys(id).filter((k) => k.startsWith('sites/'))).toEqual([]);

    const published = await publish();
    expect(published.status, await published.clone().text()).toBe(200);
    expect(
      publicKeys(id)
        .filter((k) => k.startsWith('sites/'))
        .sort(),
    ).toEqual([`sites/${SITE}/${id}/480.webp`, `sites/${SITE}/${id}/960.webp`]);
    const [row] = await h.db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
    expect(row?.publishedAt).toBeInstanceOf(Date);
    // The private originals stay where they were.
    expect([...h.media.files.keys()].filter((k) => k.includes(id))).toHaveLength(2);
  });

  it('refuses to publish pages that use an image no longer in the library', async () => {
    await useOnHome('00000000-0000-4000-8000-000000000000');
    const response = await publish();
    expect(response.status).toBe(409);
    const body = await json<{ details: { issues: { code: string }[] } }>(response);
    expect(body.details.issues.map((i) => i.code)).toContain('missing-image');
  });

  it('keeps images that pages use, as drafts or published, and says where', async () => {
    const id = await uploadImage();
    await useOnHome(id);
    const inDraft = await remove(id);
    expect(inDraft.status).toBe(409);
    const body = await json<{ error: string; details: { pages: { title: { en: string } }[] } }>(
      inDraft,
    );
    expect(body.error).toBe('media-in-use');
    expect(body.details.pages).toHaveLength(1);

    expect((await publish()).status).toBe(200);
    // Removed from the draft, but the published page still shows it.
    await useOnHome(null);
    expect((await remove(id)).status).toBe(409);
    // Once that's published too, the image can go, with its public copies.
    expect((await publish()).status).toBe(200);
    expect((await remove(id)).status).toBe(200);
    expect(publicKeys(id)).toEqual([]);
  });

  it('gives previews signed links to copies of unpublished images', async () => {
    const id = await uploadImage();
    const pageId = await useOnHome(id);
    const response = await h.request('POST', `/api/sites/${SITE}/preview`, {
      cookie: owner,
      body: {
        drafts: { 'coming-soon': false, 'site-settings': false, theme: false, builder: true },
        page: pageId,
      },
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const { fields } = await json<{ fields: { payload: string } }>(response);
    const base64 = fields.payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(decoded)) as {
      data: {
        media: Record<
          string,
          { widths: number[]; preview?: { expires: number; signature: string } }
        >;
      };
    };
    const info = data.data.media[id]!;
    expect(info.widths).toEqual([480, 960]);
    expect(info.preview?.signature).toBe(
      await hmacHex(env.PREVIEW_SIGNING_SECRET, `media:${SITE}:${id}:${info.preview?.expires}`),
    );
    expect(publicKeys(id).sort()).toEqual([
      `preview/${SITE}/${id}/480.webp`,
      `preview/${SITE}/${id}/960.webp`,
    ]);
  });
});
