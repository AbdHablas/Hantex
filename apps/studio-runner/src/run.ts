import { createPoolDb } from '@hantex/db';
import { failStaleJobs, processOneJob } from './process-job';
import { r2Store } from './store';

/**
 * The 3D Studio processing runner (D-029, D-030, D-056): a separate Node process on the Owner's
 * own hardware, never Cloudflare, polling for queued jobs through the least-privilege
 * `hantex_studio_runner` database role and reading/writing R2 through its own S3-compatible
 * credentials (never the dashboard Worker's bindings).
 *
 * Usage (docs/deployment.md, "3D Studio processing runner"):
 *   STUDIO_RUNNER_DATABASE_URL=… STUDIO_RUNNER_R2_ACCOUNT_ID=… STUDIO_RUNNER_R2_BUCKET=hantex-studio \
 *   STUDIO_RUNNER_R2_ACCESS_KEY_ID=… STUDIO_RUNNER_R2_SECRET_ACCESS_KEY=… \
 *   pnpm --filter @hantex/studio-runner start
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

const databaseUrl = requireEnv('STUDIO_RUNNER_DATABASE_URL');
const store = r2Store({
  accountId: requireEnv('STUDIO_RUNNER_R2_ACCOUNT_ID'),
  bucket: requireEnv('STUDIO_RUNNER_R2_BUCKET'),
  accessKeyId: requireEnv('STUDIO_RUNNER_R2_ACCESS_KEY_ID'),
  secretAccessKey: requireEnv('STUDIO_RUNNER_R2_SECRET_ACCESS_KEY'),
});
const pollMs = Number(process.env['STUDIO_RUNNER_POLL_MS'] ?? 10_000);

const { db, close } = createPoolDb(databaseUrl, 1);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.info(`${signal} received, finishing the current job and stopping…`);
    stopping = true;
  });
}

console.info('3D Studio processing runner started.');
while (!stopping) {
  let found = false;
  try {
    found = await processOneJob(db, store);
    if (!found) {
      const stale = await failStaleJobs(db);
      if (stale > 0)
        console.warn(`Marked ${stale} job(s) left running by a stopped runner as failed.`);
    }
  } catch (error) {
    // A lost database or storage connection: logged, then retried at the next poll.
    console.error('Error while processing a job:', error);
  }
  if (!found && !stopping) await new Promise((resolve) => setTimeout(resolve, pollMs));
}
await close();
console.info('3D Studio processing runner stopped.');
