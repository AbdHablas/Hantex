import { newLogoFile } from '@hantex/shared/logo';
import { sanitizeSvg } from '@hantex/shared/svg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';

const B = 'second-brand';
let h: Harness;
let owner: string;
let admin: string;

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('logo-owner', [{ roleId: 'owner', site: null }]);
  admin = await h.staff('logo-admin', [{ roleId: 'administrator', site: 'b' }]);
});
afterAll(() => h.close());

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><rect width="40" height="10" fill="#112233"/><circle cx="5" cy="5" r="3" fill="#ff6600"/></svg>';
const file = () => {
  const result = sanitizeSvg(SVG);
  if (!result.ok) throw new Error(result.reason);
  const f = newLogoFile(result.svg, result.colours);
  f.colours = f.colours.map((c) => (c.colour === '#112233' ? { ...c, use: 'neutral' } : c));
  return f;
};
const put = (cookie: string, body: unknown) =>
  h.request('PUT', `/api/sites/${B}/documents/logo/draft`, { cookie, body });

describe('uploaded logo', () => {
  it('starts with no logo', async () => {
    const res = await h.request('GET', `/api/sites/${B}/documents/logo`, { cookie: owner });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      draft: { lockup: null, mark: null },
      published: null,
    });
  });

  it('lets the Owner save and publish a cleaned logo', async () => {
    expect((await put(owner, { lockup: file(), mark: null })).status).toBe(200);
    const publish = await h.request('POST', `/api/sites/${B}/documents/logo/publish`, {
      cookie: owner,
      body: {},
    });
    expect(publish.status).toBe(200);
    expect(await publish.json()).toMatchObject({ version: 1 });
  });

  it('needs the logo permission, which administrators don’t have by default', async () => {
    const view = await h.request('GET', `/api/sites/${B}/documents/logo`, { cookie: admin });
    expect(view.status).toBe(200);
    const save = await put(admin, { lockup: file(), mark: null });
    expect(save.status).toBe(403);
    const publish = await h.request('POST', `/api/sites/${B}/documents/logo/publish`, {
      cookie: admin,
      body: {},
    });
    expect(publish.status).toBe(403);
  });

  it('refuses a file that wasn’t cleaned, whoever sends it', async () => {
    const f = file();
    const dirty = { ...f, svg: f.svg.replace('<rect', '<script>alert(1)</script><rect') };
    const res = await put(owner, { lockup: dirty, mark: null });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid-input' });
  });

  it('refuses an oversized request before reading it', async () => {
    const res = await put(owner, {
      lockup: { svg: 'x'.repeat(1_100_000), colours: [] },
      mark: null,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'too-large' });
  });
});
