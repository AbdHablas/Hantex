import { randomUUID } from 'node:crypto';
import {
  createPoolDb,
  ensureSite,
  FIRST_SITE,
  studioCaptureFiles,
  studioCaptures,
  studioJobs,
  studioModels,
  type AppDbRole,
  type Database,
} from '@hantex/db';
import { studioCaptureFileKey, technicalGate, type ResultLabel } from '@hantex/studio';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { failStaleJobs, processOneJob, STALE_JOB_MS } from '../src/process-job';
import { memoryStore } from '../src/store';
import { isWebp, makeBoxGlb } from './fixture';

/**
 * The runner's claim-and-process cycle, for real: a real PostgreSQL database, reached as the
 * least-privilege `hantex_studio_runner` user (D-056) rather than the database owner, so these
 * tests also prove that user's grants are enough to do the job.
 */

const databaseUrl = inject('databaseUrl');
const rolePasswords = inject('rolePasswords');

let owner: ReturnType<typeof createPoolDb>;
let ownerDb: Database;
/** Two separate connections as the runner, like two runner processes. */
let runners: ReturnType<typeof createPoolDb>[];
let runnerDb: Database;
let siteId: string;

function runnerUrl(): string {
  const url = new URL(databaseUrl);
  const role: AppDbRole = 'hantex_studio_runner';
  url.username = role;
  url.password = rolePasswords[role];
  return url.toString();
}

beforeAll(async () => {
  owner = createPoolDb(databaseUrl);
  ownerDb = owner.db;
  siteId = await ensureSite(ownerDb, FIRST_SITE);
  runners = [createPoolDb(runnerUrl(), 1), createPoolDb(runnerUrl(), 1)];
  runnerDb = runners[0]!.db;
});

afterAll(async () => {
  await Promise.all(runners.map((r) => r.close()));
  await owner.close();
});

async function insertCapture(
  dimensionsMm: { width: number; height: number; depth: number } | null,
) {
  const [capture] = await ownerDb
    .insert(studioCaptures)
    .values({
      siteId,
      productId: 'prd000001',
      widthMm: dimensionsMm?.width ?? null,
      heightMm: dimensionsMm?.height ?? null,
      depthMm: dimensionsMm?.depth ?? null,
    })
    .returning();
  return capture!;
}

/** Records an uploaded model the way the dashboard API does, and stores its bytes. */
async function uploadModel(
  store: ReturnType<typeof memoryStore>,
  captureId: string,
  bytes: Uint8Array,
  format = 'glb',
) {
  const storageKey = studioCaptureFileKey(siteId, captureId, randomUUID());
  await ownerDb
    .insert(studioCaptureFiles)
    .values({ captureId, kind: 'model', format, storageKey, bytes: bytes.byteLength });
  await store.put(storageKey, bytes, 'application/octet-stream');
}

async function queueJob(
  captureId: string,
  providerId: string,
  method: string,
  finishIds: string[] = [],
) {
  const [job] = await ownerDb
    .insert(studioJobs)
    .values({ siteId, captureId, providerId, method, finishIds })
    .returning();
  return job!;
}

const jobRow = async (id: string) =>
  (await ownerDb.select().from(studioJobs).where(eq(studioJobs.id, id)))[0]!;

describe('processOneJob', () => {
  it('returns false when nothing is queued', async () => {
    await expect(processOneJob(runnerDb, memoryStore())).resolves.toBe(false);
  });

  it('processes a queued model-import job end to end, as the runner user', async () => {
    const store = memoryStore();
    const capture = await insertCapture({ width: 1000, height: 1000, depth: 500 });
    await uploadModel(store, capture.id, await makeBoxGlb());
    const job = await queueJob(capture.id, 'model-import', 'artist', ['black00001']);

    await expect(processOneJob(runnerDb, store)).resolves.toBe(true);

    const done = await jobRow(job.id);
    expect(done.status).toBe('done');
    expect(done.actualCostCents).toBe(0);
    expect(done.startedAt).not.toBeNull();
    expect(done.finishedAt).not.toBeNull();

    const [model] = await ownerDb.select().from(studioModels).where(eq(studioModels.jobId, job.id));
    expect(model?.label).toBe('artist-modelled');
    expect(model?.withinScale).toBe(true);
    expect(technicalGate({ ...model!, label: model!.label as ResultLabel })).toEqual([]);

    const files = model!.files as Record<string, string>;
    expect(Object.keys(files).sort()).toEqual([
      'desktop',
      'mobile',
      'posterFront',
      'posterThreeQuarter',
    ]);
    for (const key of Object.values(files)) {
      expect(key.startsWith(`${siteId}/models/${model!.id}/`)).toBe(true);
      expect(store.files.has(key)).toBe(true);
    }
    expect(isWebp(store.files.get(files['posterFront']!)!)).toBe(true);
  }, 60_000);

  it('fails a job honestly when its provider has no runner pipeline (cad-step)', async () => {
    const capture = await insertCapture(null);
    const job = await queueJob(capture.id, 'cad-step', 'cad');

    await expect(processOneJob(runnerDb, memoryStore())).resolves.toBe(true);

    const failed = await jobRow(job.id);
    expect(failed.status).toBe('failed');
    expect(failed.detail).toMatch(/no runner pipeline/);
    expect(await ownerDb.select().from(studioModels).where(eq(studioModels.jobId, job.id))).toEqual(
      [],
    );
  });

  it('fails a job honestly when the capture has no finished model', async () => {
    const capture = await insertCapture(null);
    const job = await queueJob(capture.id, 'model-import', 'artist');

    await expect(processOneJob(runnerDb, memoryStore())).resolves.toBe(true);

    const failed = await jobRow(job.id);
    expect(failed.status).toBe('failed');
    expect(failed.detail).toMatch(/no finished-model upload/);
  });

  it('fails a job honestly for a format it cannot convert yet, rather than guessing', async () => {
    const store = memoryStore();
    const capture = await insertCapture(null);
    await uploadModel(store, capture.id, new TextEncoder().encode('v 0 0 0\n'), 'obj');
    const job = await queueJob(capture.id, 'model-import', 'artist');

    await expect(processOneJob(runnerDb, store)).resolves.toBe(true);

    const failed = await jobRow(job.id);
    expect(failed.status).toBe('failed');
    expect(failed.detail).toMatch(/"obj" isn't converted yet/);
  });

  it('fails a job whose file is unreadable, keeping the reason', async () => {
    const store = memoryStore();
    const capture = await insertCapture(null);
    await uploadModel(store, capture.id, new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]));
    const job = await queueJob(capture.id, 'model-import', 'artist');

    await expect(processOneJob(runnerDb, store)).resolves.toBe(true);

    const failed = await jobRow(job.id);
    expect(failed.status).toBe('failed');
    expect(failed.detail).not.toBe('');
  });

  it('leaves no files behind when the capture is deleted while its job runs', async () => {
    const store = memoryStore();
    const capture = await insertCapture(null);
    await uploadModel(store, capture.id, await makeBoxGlb());
    await queueJob(capture.id, 'model-import', 'artist');
    // The dashboard deletes the capture just as the runner stores the last output.
    const put = store.put.bind(store);
    store.put = async (key, bytes, contentType) => {
      await put(key, bytes, contentType);
      if (key.endsWith('poster-three-quarter.webp')) {
        await ownerDb.delete(studioCaptures).where(eq(studioCaptures.id, capture.id));
      }
    };

    await expect(processOneJob(runnerDb, store)).resolves.toBe(true);

    expect([...store.files.keys()].filter((key) => key.includes('/models/'))).toEqual([]);
  }, 60_000);

  it('fails jobs a stopped runner left running, and only those', async () => {
    const capture = await insertCapture(null);
    const stale = await queueJob(capture.id, 'model-import', 'artist');
    const live = await queueJob(capture.id, 'model-import', 'artist');
    const now = new Date();
    await ownerDb
      .update(studioJobs)
      .set({ status: 'running', startedAt: new Date(now.getTime() - STALE_JOB_MS - 60_000) })
      .where(eq(studioJobs.id, stale.id));
    await ownerDb
      .update(studioJobs)
      .set({ status: 'running', startedAt: new Date(now.getTime() - 60_000) })
      .where(eq(studioJobs.id, live.id));

    await expect(failStaleJobs(runnerDb, now)).resolves.toBe(1);

    expect((await jobRow(stale.id)).status).toBe('failed');
    expect((await jobRow(stale.id)).detail).toMatch(/stopped while working on this job/);
    expect((await jobRow(live.id)).status).toBe('running');
  });

  it('lets two runners on separate connections claim one queued job only once', async () => {
    const store = memoryStore();
    const capture = await insertCapture(null);
    await uploadModel(store, capture.id, await makeBoxGlb());
    const job = await queueJob(capture.id, 'model-import', 'artist');

    const claimed = await Promise.all(runners.map((r) => processOneJob(r.db, store)));
    expect(claimed.filter(Boolean)).toHaveLength(1);

    expect((await jobRow(job.id)).status).toBe('done');
    const models = await ownerDb.select().from(studioModels).where(eq(studioModels.jobId, job.id));
    expect(models).toHaveLength(1);
  }, 60_000);
});
