import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPoolDb } from '@hantex/db';
import { processOneJob } from '@hantex/studio-runner/process-job';
import type { StudioStore } from '@hantex/studio-runner/store';

/**
 * The 3D Studio's processing runner, run for real inside the browser test: its own pipeline,
 * as its own database user, against the same local R2 bucket `wrangler dev` serves the
 * dashboard from. Locally there is no S3 API, so storage goes through wrangler's own CLI.
 */

const BUCKET = 'hantex-studio';

function wrangler(args: string[], input?: Buffer): Buffer {
  return execFileSync(
    'pnpm',
    ['--filter', '@hantex/api', 'exec', 'wrangler', 'r2', 'object', ...args, '--local'],
    { input, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 64 << 20 },
  );
}

function localBucket(): StudioStore {
  return {
    get(key) {
      try {
        return Promise.resolve(new Uint8Array(wrangler(['get', `${BUCKET}/${key}`, '--pipe'])));
      } catch {
        return Promise.resolve(null);
      }
    },
    put(key, bytes, contentType) {
      const dir = mkdtempSync(join(tmpdir(), 'studio-'));
      try {
        const file = join(dir, 'object');
        writeFileSync(file, bytes);
        wrangler(['put', `${BUCKET}/${key}`, '--file', file, '--content-type', contentType]);
        return Promise.resolve();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    delete(keys) {
      for (const key of keys) wrangler(['delete', `${BUCKET}/${key}`]);
      return Promise.resolve();
    },
  };
}

/** Claims and processes one queued job, as the runner would on the Owner's computer. */
export async function runOneStudioJob(): Promise<boolean> {
  const { db, close } = createPoolDb(process.env['E2E_RUNNER_DATABASE_URL'] ?? '', 1);
  try {
    return await processOneJob(db, localBucket());
  } finally {
    await close();
  }
}
