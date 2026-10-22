import { publishJobs } from '@hantex/db/worker';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { AppEnv } from '../context';

/** Records a publish job and asks the pipeline to rebuild this site only (D-006, D-028). */
export async function startRebuild(c: Context<AppEnv>) {
  const v = c.var;
  const [job] = await v.db
    .insert(publishJobs)
    .values({ siteId: v.site.id, requestedBy: v.access.userId })
    .returning({ id: publishJobs.id });
  const result = job
    ? await v.deps.publisher(c.env).dispatch({ jobId: job.id, siteKey: v.site.key })
    : { dispatched: false, detail: 'no-job' };
  if (job) {
    await v.db
      .update(publishJobs)
      .set({ status: result.dispatched ? 'dispatched' : 'failed', detail: result.detail })
      .where(eq(publishJobs.id, job.id));
  }
  return { job, result };
}
