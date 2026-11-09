import { randomUUID } from 'node:crypto';
import {
  studioCaptureFiles,
  studioCaptures,
  studioJobs,
  studioModels,
  type Database,
} from '@hantex/db';
import { LABEL_OF_METHOD, providerById, studioModelKey, type Method } from '@hantex/studio';
import { and, asc, eq, lt } from 'drizzle-orm';
import { runPipeline, type PipelineInput } from './pipeline';
import type { StudioStore } from './store';

/**
 * One claim-and-process cycle (D-029 §6, D-056). Stage 1 runs only the `model-import` provider:
 * a finished GLB or glTF file, carried through the shared pipeline. A job for anything else —
 * `cad-step`, or a model format the pipeline can't read yet (OBJ, USDZ, FBX) — fails with that
 * reason; the runner never records a result it hasn't produced.
 */

/**
 * Moves the oldest queued job to 'running'. Two runners can't both claim it: under READ
 * COMMITTED, the second UPDATE waits for the first's row lock, then re-checks
 * `status = 'queued'` against the committed row and matches nothing.
 */
async function claimNextJob(db: Database) {
  const next = db
    .select({ id: studioJobs.id })
    .from(studioJobs)
    .where(eq(studioJobs.status, 'queued'))
    .orderBy(asc(studioJobs.createdAt))
    .limit(1);
  const [job] = await db
    .update(studioJobs)
    .set({ status: 'running', startedAt: new Date() })
    .where(and(eq(studioJobs.id, next), eq(studioJobs.status, 'queued')))
    .returning();
  return job ?? null;
}

async function failJob(db: Database, jobId: string, detail: string): Promise<void> {
  await db
    .update(studioJobs)
    .set({ status: 'failed', detail, finishedAt: new Date() })
    .where(eq(studioJobs.id, jobId));
}

/** A job takes seconds to minutes; one still running after this was left by a stopped runner. */
export const STALE_JOB_MS = 60 * 60 * 1000;

/**
 * Fails jobs a runner left 'running' (stopped mid-job), so they can be started again and their
 * capture deleted. Returns how many there were.
 */
export async function failStaleJobs(db: Database, now = new Date()): Promise<number> {
  const stale = await db
    .update(studioJobs)
    .set({
      status: 'failed',
      detail: 'The processing runner stopped while working on this job; start it again.',
      finishedAt: now,
    })
    .where(
      and(
        eq(studioJobs.status, 'running'),
        lt(studioJobs.startedAt, new Date(now.getTime() - STALE_JOB_MS)),
      ),
    )
    .returning({ id: studioJobs.id });
  return stale.length;
}

/** Claims and runs the next queued job, if any. Returns whether there was one. */
export async function processOneJob(db: Database, store: StudioStore): Promise<boolean> {
  const job = await claimNextJob(db);
  if (!job) return false;

  try {
    const provider = providerById(job.providerId);
    if (!provider?.implemented || provider.id !== 'model-import') {
      throw new Error(`The provider "${job.providerId}" has no runner pipeline yet.`);
    }

    const [capture] = await db
      .select()
      .from(studioCaptures)
      .where(eq(studioCaptures.id, job.captureId));
    if (!capture) throw new Error('The capture this job belongs to no longer exists.');

    const files = await db
      .select()
      .from(studioCaptureFiles)
      .where(eq(studioCaptureFiles.captureId, job.captureId));
    const modelFile = files.find((f) => f.kind === 'model');
    if (!modelFile) throw new Error('This capture has no finished-model upload to process.');

    const bytes = await store.get(modelFile.storageKey);
    if (!bytes) throw new Error('The model file is missing from storage.');

    const output = await runPipeline({
      bytes,
      format: modelFile.format as PipelineInput['format'],
      finishIds: (job.finishIds as string[] | null) ?? [],
      dimensionsMm:
        capture.widthMm !== null && capture.heightMm !== null && capture.depthMm !== null
          ? { width: capture.widthMm, height: capture.heightMm, depth: capture.depthMm }
          : null,
    });

    const modelId = randomUUID();
    const fileKeys = {
      desktop: studioModelKey(job.siteId, modelId, 'desktop.glb'),
      mobile: studioModelKey(job.siteId, modelId, 'mobile.glb'),
      posterFront: studioModelKey(job.siteId, modelId, 'poster-front.webp'),
      posterThreeQuarter: studioModelKey(job.siteId, modelId, 'poster-three-quarter.webp'),
    };
    await store.put(fileKeys.desktop, output.desktop, 'model/gltf-binary');
    await store.put(fileKeys.mobile, output.mobile, 'model/gltf-binary');
    await store.put(fileKeys.posterFront, output.posterFront, 'image/webp');
    await store.put(fileKeys.posterThreeQuarter, output.posterThreeQuarter, 'image/webp');

    try {
      await db.insert(studioModels).values({
        id: modelId,
        siteId: job.siteId,
        captureId: job.captureId,
        jobId: job.id,
        label: LABEL_OF_METHOD[job.method as Method],
        files: fileKeys,
        measurements: output.measurements,
        validatorReport: output.validatorReport,
        withinScale: output.withinScale,
      });
    } catch (error) {
      // The capture was deleted while the job ran, for example: leave no files behind.
      await store.delete(Object.values(fileKeys));
      throw error;
    }

    await db
      .update(studioJobs)
      // Stage 1's only provider is free; paid providers record their real cost (stage 2).
      .set({ status: 'done', actualCostCents: 0, finishedAt: new Date() })
      .where(eq(studioJobs.id, job.id));
  } catch (error) {
    await failJob(db, job.id, error instanceof Error ? error.message : String(error));
  }
  return true;
}
