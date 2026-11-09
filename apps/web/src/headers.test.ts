import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/** The site's security headers (public/_headers): each path's Content-Security-Policy. */
async function policies() {
  const text = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  const found = new Map<string, string>();
  let path = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('/')) path = line.trim();
    const match = /^\s+Content-Security-Policy:\s*(.+)$/.exec(line);
    if (match) found.set(path, match[1]!.trim());
  }
  return found;
}

describe('security headers (D-052)', () => {
  it('lets only search compile WebAssembly, and changes nothing else', async () => {
    const all = await policies();
    const base = all.get('/*')!;
    expect(base).not.toContain('wasm-unsafe-eval');
    expect(base).not.toContain("'unsafe-eval'");
    for (const path of ['/search/', '/:lang/search/', '/pagefind/*']) {
      expect(all.get(path), path).toBe(
        base.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'"),
      );
    }
    expect([...all.keys()].sort()).toEqual(['/*', '/:lang/search/', '/pagefind/*', '/search/']);
  });

  it('allows the 3D viewer its blob: textures and its own stylesheet, and no other inline style (D-057)', async () => {
    const base = (await policies()).get('/*')!;
    expect(base).toContain("img-src 'self' data: blob:;");
    expect(base).toContain("connect-src 'self' blob: ");
    expect(base).toContain(
      "style-src 'self' 'sha256-PXtZZkJMMyc18o/DN1ZEFOJ2qEGq95IQbVaJFMOXOb0=';",
    );
    expect(base).not.toContain("'unsafe-inline'");
  });
});
