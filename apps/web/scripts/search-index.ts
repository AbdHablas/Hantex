/**
 * Site search index (D-052): after `astro build`, Pagefind (MIT) reads the built pages of a live
 * website and writes its index to dist/client/pagefind/, served with the site's other files.
 * Only content marked with data-pagefind-body is indexed: the builder's and the catalogue's pages,
 * never previews, the Coming Soon page or the search page itself. Each language gets its own index.
 */
import * as pagefind from 'pagefind';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SiteData } from '../src/site-data';
import data from '../src/data/site.json' with { type: 'json' };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'dist', 'client');
const output = join(site, 'pagefind');
const built = data as SiteData;

await rm(output, { recursive: true, force: true });
if (built.site.mode !== 'live' || !built.builder) {
  console.info('Search index skipped: the site is not live.');
  process.exit(0);
}

const fail = (step: string, errors: string[]) => {
  console.error(`Search index failed (${step}): ${errors.join('; ')}`);
  process.exit(1);
};
const created = await pagefind.createIndex({});
if (!created.index || created.errors.length > 0) fail('create', created.errors);
const index = created.index!;
const added = await index.addDirectory({ path: site });
if (added.errors.length > 0) fail('index', added.errors);
const written = await index.writeFiles({ outputPath: output });
if (written.errors.length > 0) fail('write', written.errors);
await pagefind.close();
console.info(`Search index written: ${added.page_count} pages.`);
