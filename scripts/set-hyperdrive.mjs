// Fills in a Worker's Hyperdrive configuration id at deployment (the repository only holds a
// placeholder). Usage: node scripts/set-hyperdrive.mjs <wrangler config file> <hyperdrive id>
import { readFile, writeFile } from 'node:fs/promises';

const [file, id] = process.argv.slice(2);
const PLACEHOLDER = '00000000000000000000000000000000';
if (!file || !/^[0-9a-f]{32}$/.test(id ?? '')) {
  console.error('Usage: node scripts/set-hyperdrive.mjs <config> <32-character hyperdrive id>');
  process.exit(1);
}
const text = await readFile(file, 'utf8');
if (!text.includes(PLACEHOLDER)) {
  console.error(`${file} has no Hyperdrive placeholder`);
  process.exit(1);
}
await writeFile(file, text.replaceAll(PLACEHOLDER, id));
console.info(`Hyperdrive id set in ${file}`);
