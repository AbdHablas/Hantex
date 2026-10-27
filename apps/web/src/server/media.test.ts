import { describe, expect, it } from 'vitest';
import { hmacHex } from './crypto';
import { serveMedia, type MediaBucket } from './media';

const SECRET = 'test-preview-secret-0123456789abcdef';
const ID = '0b6f5d0e-3c1a-4c2e-9a51-2f4d8e7b6a10';
const bytes = new Uint8Array([1, 2, 3, 4]).buffer;

const bucket = (keys: string[]): MediaBucket & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    get(key) {
      asked.push(key);
      return Promise.resolve(keys.includes(key) ? { body: bytes.slice(0), size: 4 } : null);
    },
  };
};

const serve = (path: string, store: MediaBucket, method = 'GET') =>
  serveMedia(new Request(`https://example.test${path}`, { method }), {
    bucket: store,
    siteKey: 'hantex-ultra',
    previewSecret: SECRET,
  });

const signed = async (siteKey: string, id: string, expires: number, secret = SECRET) =>
  `expires=${expires}&signature=${await hmacHex(secret, `media:${siteKey}:${id}:${expires}`)}`;

const later = () => Math.floor(Date.now() / 1000) + 600;

describe('site media', () => {
  it('serves this site’s published images, cached for a year', async () => {
    const store = bucket([`sites/hantex-ultra/${ID}/960.webp`]);
    const response = await serve(`/media/${ID}/960.webp`, store);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(bytes));
  });

  it('answers HEAD without a body and refuses other methods', async () => {
    const store = bucket([`sites/hantex-ultra/${ID}/960.webp`]);
    const head = await serve(`/media/${ID}/960.webp`, store, 'HEAD');
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect((await serve(`/media/${ID}/960.webp`, store, 'POST')).status).toBe(405);
  });

  it('finds nothing outside this site’s published files', async () => {
    const store = bucket([]);
    for (const path of [
      `/media/${ID}/960.webp`,
      `/media/${ID}/960.png`,
      `/media/not-an-id/960.webp`,
      `/media/${ID}/../../other-site/${ID}/960.webp`,
      `/media/${ID.toUpperCase()}/960.webp`,
      `/media/${ID}/9.webp`,
    ]) {
      expect((await serve(path, store)).status, path).toBe(404);
    }
    // Only well-formed keys inside this site's published space were ever looked up.
    expect(store.asked).toEqual([`sites/hantex-ultra/${ID}/960.webp`]);
  });

  it('serves preview copies only with a valid signed link', async () => {
    const store = bucket([`preview/hantex-ultra/${ID}/480.webp`]);
    const path = `/media/preview/${ID}/480.webp`;
    const ok = await serve(`${path}?${await signed('hantex-ultra', ID, later())}`, store);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('private, no-store');

    expect((await serve(path, store)).status).toBe(404);
    const past = Math.floor(Date.now() / 1000) - 1;
    expect((await serve(`${path}?${await signed('hantex-ultra', ID, past)}`, store)).status).toBe(
      404,
    );
    const otherSite = await signed('other-site', ID, later());
    expect((await serve(`${path}?${otherSite}`, store)).status).toBe(404);
    const otherKey = await signed('hantex-ultra', ID, later(), 'another-secret');
    expect((await serve(`${path}?${otherKey}`, store)).status).toBe(404);
    const otherImage = await signed('hantex-ultra', ID.replace('0b6f', '1b6f'), later());
    expect((await serve(`${path}?${otherImage}`, store)).status).toBe(404);
  });
});
