import { documentDrafts } from '@hantex/db/worker';
import { brandTheme } from '@hantex/theme';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fontFile } from './font-files';
import { createHarness, type Harness } from './harness';

const B = 'second-brand';
let h: Harness;
let owner: string;
let admin: string;
let content: string;

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('font-owner', [{ roleId: 'owner', site: null }]);
  admin = await h.staff('font-admin', [{ roleId: 'administrator', site: null }]);
  content = await h.staff('font-content', [{ roleId: 'content-manager', site: 'b' }]);
});
afterAll(() => h.close());

const json = async <T>(response: Response) => (await response.json()) as T;
const LICENCE = { name: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org' };

function form(files: [string, string][], meta: unknown = { licence: LICENCE, confirmed: true }) {
  const body = new FormData();
  body.set('meta', JSON.stringify(meta));
  for (const [family, file] of files) {
    body.append('file', new File([fontFile(family, file)], file, { type: 'font/woff2' }));
  }
  return body;
}
const upload = (cookie: string, body: FormData) =>
  h.request('POST', '/api/fonts', { cookie, body });
const CAIRO = [
  ['cairo', 'cairo-latin-400-normal.woff2'],
  ['cairo', 'cairo-latin-700-normal.woff2'],
] as [string, string][];

describe('uploaded fonts (D-033)', () => {
  it('lets the Owner upload a family, with its licence recorded', async () => {
    const res = await upload(owner, form(CAIRO));
    expect(res.status).toBe(201);
    const { id } = await json<{ id: string }>(res);
    expect(id).toMatch(/^upload-[0-9a-f-]{36}$/);
    const list = await json<
      {
        id: string;
        name: string;
        scripts: string[];
        files: { weight: number; url: string }[];
        licence: unknown;
        licenceConfirmedBy: string;
      }[]
    >(await h.request('GET', '/api/fonts', { cookie: owner }));
    const font = list.find((f) => f.id === id)!;
    expect(font).toMatchObject({
      name: 'Cairo',
      scripts: ['latin'],
      licence: LICENCE,
      licenceConfirmedBy: 'font-owner@example.test',
    });
    expect(font.files.map((f) => f.weight)).toEqual([400, 700]);
    // Stored in the public bucket, where the websites read it.
    const uuid = id.slice('upload-'.length);
    expect(await h.publicMedia.has(`fonts/${uuid}/700.woff2`)).toBe(true);
    const file = await h.request('GET', font.files[0]!.url, { cookie: admin });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('font/woff2');
  });

  it('is Owner only; people who style a site may only list fonts', async () => {
    expect((await upload(admin, form(CAIRO))).status).toBe(403);
    expect((await h.request('GET', '/api/fonts', { cookie: admin })).status).toBe(200);
    expect((await h.request('GET', '/api/fonts', { cookie: content })).status).toBe(403);
  });

  it('needs the licence confirmed', async () => {
    const res = await upload(owner, form(CAIRO, { licence: LICENCE, confirmed: false }));
    expect(res.status).toBe(400);
  });

  it('checks every file, whatever its name or type says', async () => {
    const body = new FormData();
    body.set('meta', JSON.stringify({ licence: LICENCE, confirmed: true }));
    body.append('file', new File(['<svg/>'], 'font.woff2', { type: 'font/woff2' }));
    const res = await upload(owner, body);
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'invalid-font' });
  });

  it('refuses mixed families, repeated weights and weights that write different scripts', async () => {
    const error = async (files: [string, string][]) =>
      (await json<{ error: string }>(await upload(owner, form(files)))).error;
    expect(
      await error([
        ['cairo', 'cairo-latin-400-normal.woff2'],
        ['inter', 'inter-latin-700-normal.woff2'],
      ]),
    ).toBe('font-mixed-families');
    expect(
      await error([
        ['cairo', 'cairo-latin-400-normal.woff2'],
        ['cairo', 'cairo-latin-400-normal.woff2'],
      ]),
    ).toBe('font-duplicate-weight');
    expect(
      await error([
        ['cairo', 'cairo-latin-400-normal.woff2'],
        ['cairo', 'cairo-arabic-700-normal.woff2'],
      ]),
    ).toBe('font-scripts-differ');
  });

  it('can be used in a theme only for the scripts it writes, and not deleted while in use', async () => {
    const { id } = await json<{ id: string }>(await upload(owner, form(CAIRO)));
    const theme = structuredClone(brandTheme) as unknown as {
      typography: { fonts: { body: { latin: string; arabic: string } } };
    };
    theme.typography.fonts.body.latin = id;
    const save = (body: unknown) =>
      h.request('PUT', `/api/sites/${B}/documents/theme/draft`, { cookie: owner, body });
    expect((await save(theme)).status).toBe(200);
    // This family has no Arabic letters.
    theme.typography.fonts.body.arabic = id;
    const refused = await save(theme);
    expect(refused.status).toBe(400);
    expect(await json<{ error: string }>(refused)).toMatchObject({ error: 'theme-fonts' });
    // An id that was never uploaded.
    theme.typography.fonts.body.arabic = 'cairo';
    theme.typography.fonts.body.latin = 'upload-00000000-0000-4000-8000-000000000000';
    expect((await save(theme)).status).toBe(400);

    const uuid = id.slice('upload-'.length);
    const del = await h.request('DELETE', `/api/fonts/${uuid}`, { cookie: owner });
    expect(del.status).toBe(409);
    expect(await json<{ error: string }>(del)).toMatchObject({ error: 'font-in-use' });

    await h.db.delete(documentDrafts);
    const ok = await h.request('DELETE', `/api/fonts/${uuid}`, { cookie: owner });
    expect(ok.status).toBe(200);
    expect(await h.publicMedia.has(`fonts/${uuid}/400.woff2`)).toBe(false);
  });
});
