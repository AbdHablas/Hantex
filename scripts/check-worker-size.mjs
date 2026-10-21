// Fails CI if a Worker bundle approaches the Workers Free plan's size limit (D-007).
// Usage: node scripts/check-worker-size.mjs <bundle directory>...
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const LIMIT = 64 * 1024 * 1024; // Free plan: 64 MiB uncompressed (checked 2026-10-21)
const WARN_AT = 0.5;

async function size(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /\.(m?js|wasm)$/.test(entry.name)) {
      total += (await stat(join(entry.parentPath, entry.name))).size;
    }
  }
  return total;
}

let failed = false;
for (const dir of process.argv.slice(2)) {
  const bytes = await size(dir);
  const share = bytes / LIMIT;
  const line = `${dir}: ${(bytes / 1024 / 1024).toFixed(2)} MiB (${(share * 100).toFixed(1)}% of the Free plan limit)`;
  if (share >= WARN_AT) {
    console.error(`Too large: ${line}`);
    failed = true;
  } else {
    console.info(line);
  }
}
process.exit(failed ? 1 : 0);
