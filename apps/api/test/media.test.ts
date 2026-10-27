import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, env, type Harness } from './harness';
import { fakeWebp } from './fixtures';

/**
 * The media library (D-044): uploads are checked by their bytes, stored per site in private
 * storage, shown to staff through the API only, and follow the approved roles.
 */

let h: Harness;
let owner: string;
let editor: string;
let viewer: string;
const path = (site: string, suffix = '') => `/api/sites/${site}/media${suffix}`;
const json = async <T>(response: Response) => (await response.json()) as T;

function upload(
  files: Record<string, ArrayBuffer | string>,
  meta: unknown = { name: 'plate.jpg', alt: { ar: 'مفتاح أبيض', en: 'White switch' } },
) {
  const form = new FormData();
  form.set('meta', JSON.stringify(meta));
  for (const [field, data] of Object.entries(files)) {
    form.set(field, new Blob([data], { type: 'image/webp' }), `${field}.webp`);
  }
  return form;
}

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('md-owner', [{ roleId: 'owner', site: null }]);
  editor = await h.staff('md-editor', [{ roleId: 'editor', site: null }]);
  viewer = await h.staff('md-viewer', [{ roleId: 'viewer', site: null }]);
});
afterAll(() => h.close());

describe('media uploads', () => {
  it('stores checked WebP widths privately and serves them to staff only', async () => {
    const created = await h.request('POST', path('hantex-ultra'), {
      cookie: editor,
      body: upload({ w480: fakeWebp(480, 320), w960: fakeWebp(960, 640) }),
    });
    expect(created.status, h.errors.at(-1)).toBe(201);
    const { id } = await json<{ id: string }>(created);
    expect([...h.media.files.keys()].filter((k) => k.includes(id))).toHaveLength(2);

    const list = await json<{
      items: { id: string; width: number; urls: Record<string, string>; alt: { en: string } }[];
      usedBytes: number;
    }>(await h.request('GET', path('hantex-ultra'), { cookie: viewer }));
    const item = list.items.find((i) => i.id === id)!;
    expect(item).toMatchObject({ width: 960, alt: { en: 'White switch' } });
    expect(list.usedBytes).toBeGreaterThan(0);

    const one = await h.request('GET', path('hantex-ultra', `/${id}`), { cookie: viewer });
    expect(await json<{ id: string; name: string }>(one)).toMatchObject({ id, name: 'plate.jpg' });
    expect((await h.request('GET', path('second-brand', `/${id}`), { cookie: owner })).status).toBe(
      404,
    );

    const file = await h.request('GET', item.urls['480']!.replace(/^/, ''), { cookie: viewer });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/webp');
    // Like every API response, never cached (apps/api/src/middleware/security.ts).
    expect(file.headers.get('cache-control')).toBe('no-store');
    // Not without a session, and not from another site.
    expect((await h.request('GET', item.urls['480']!)).status).toBe(401);
    expect(
      (await h.request('GET', path('second-brand', `/${id}/480.webp`), { cookie: owner })).status,
    ).toBe(404);
  });

  it('refuses files that are not WebP, mismatched sizes and different pictures', async () => {
    const post = (files: Record<string, ArrayBuffer | string>) =>
      h.request('POST', path('hantex-ultra'), { cookie: editor, body: upload(files) });
    const png = new Uint8Array(64);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    expect((await post({ w480: png.buffer })).status).toBe(400);
    // The field says 480 but the image is 500 wide.
    expect((await post({ w480: fakeWebp(500, 300) })).status).toBe(400);
    // Two widths of different shapes are not the same picture.
    expect((await post({ w480: fakeWebp(480, 480), w960: fakeWebp(960, 300) })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ notes: 'hello' })).status).toBe(400);
  });

  it('keeps each site within its quota', async () => {
    env.MEDIA_SITE_QUOTA_MB = '0.0001';
    const response = await h.request('POST', path('second-brand'), {
      cookie: owner,
      body: upload({ w960: fakeWebp(960, 640, 400) }),
    });
    delete env.MEDIA_SITE_QUOTA_MB;
    expect(response.status).toBe(409);
  });

  it('follows the roles: viewers look, editors upload and describe, only administrators delete', async () => {
    expect(
      (
        await h.request('POST', path('hantex-ultra'), {
          cookie: viewer,
          body: upload({ w480: fakeWebp(480, 320) }),
        })
      ).status,
    ).toBe(403);
    const { id } = await json<{ id: string }>(
      await h.request('POST', path('hantex-ultra'), {
        cookie: editor,
        body: upload({ w480: fakeWebp(480, 320) }),
      }),
    );
    const renamed = await h.request('PATCH', path('hantex-ultra', `/${id}`), {
      cookie: editor,
      body: { alt: { ar: 'مقبس', en: 'Socket' } },
    });
    expect(renamed.status).toBe(200);
    expect(
      (await h.request('DELETE', path('hantex-ultra', `/${id}`), { cookie: editor })).status,
    ).toBe(403);
    expect(
      (await h.request('DELETE', path('hantex-ultra', `/${id}`), { cookie: owner })).status,
    ).toBe(200);
    expect([...h.media.files.keys()].some((k) => k.includes(id))).toBe(false);
  });
});
