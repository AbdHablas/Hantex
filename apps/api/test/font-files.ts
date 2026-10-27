import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** Real WOFF2 files from the built-in library (@fontsource, OFL-1.1), for upload tests. */
const require = createRequire(new URL('../../web/package.json', import.meta.url).href);

export function fontFile(family: string, file: string): ArrayBuffer {
  const dir = join(dirname(require.resolve(`@fontsource/${family}/package.json`)), 'files');
  const bytes = readFileSync(join(dir, file));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
