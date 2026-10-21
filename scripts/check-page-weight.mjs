// Page-weight budget for the public sites (docs/development.md): what a first visit to a site's
// home page downloads, compressed as Cloudflare serves it. Fails the build when a change makes
// the page noticeably heavier, so slow phones on mobile data stay fast.
// Usage: node scripts/check-page-weight.mjs apps/web/dist/client
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = {
  // HTML, stylesheets and scripts, gzip-compressed.
  code: 30 * 1024,
  // Font files (already compressed WOFF2) actually referenced by the theme.
  fonts: 200 * 1024,
};

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/check-page-weight.mjs <static output folder>');
  process.exit(1);
}

const html = await readFile(join(dir, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:href|src)="(\/[^"]+\.(?:css|js))"/g)].map((m) => m[1]);
let code = gzipSync(html).length;
const lines = [`  index.html ${gzipSync(html).length} B`];
for (const ref of new Set(refs)) {
  const body = await readFile(join(dir, ref));
  const size = gzipSync(body).length;
  code += size;
  lines.push(`  ${ref} ${size} B`);
}

const theme = await readFile(join(dir, 'theme.css'), 'utf8');
let fonts = 0;
for (const [, file] of theme.matchAll(/url\("(\/fonts\/[^"]+)"\)/g)) {
  const size = (await readFile(join(dir, file))).length;
  fonts += size;
  lines.push(`  ${file} ${size} B`);
}

console.info(lines.join('\n'));
const report = (name, used, budget) =>
  `${name}: ${(used / 1024).toFixed(1)} KB of ${(budget / 1024).toFixed(0)} KB`;
console.info(report('Code (gzip)', code, BUDGET.code));
console.info(report('Fonts', fonts, BUDGET.fonts));
if (code > BUDGET.code || fonts > BUDGET.fonts) {
  console.error('The home page is over its weight budget.');
  process.exit(1);
}
