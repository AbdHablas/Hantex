import {
  FIRST_SITE,
  studioCaptureFiles,
  studioJobs,
  studioModels,
  studioProviderSettings,
} from '@hantex/db/worker';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeWebp } from './fixtures';
import { createHarness, type Harness } from './harness';

/**
 * The AI 3D Product Studio (D-029, D-030, D-056) in the dashboard API: captures, uploads,
 * eligibility, starting jobs within a budget, review and approval. Uses a website of its own.
 */

let h: Harness;
let owner: string;
let editor: string;
let reviewer: string;
let viewer: string;
const SITE = FIRST_SITE.key;
const base = `/api/sites/${SITE}/studio`;
const json = async <T>(response: Response) => (await response.json()) as T;

interface Capture {
  id: string;
}
interface CaptureDetail {
  capture: Capture;
  files: { id: string; kind: string; view: string | null }[];
  eligibility: { method: string; possible: boolean; reason?: string }[];
}
interface Job {
  id: string;
  status: string;
}

const createCapture = (productId = 'prd000001', cookie = owner) =>
  h.request('POST', `${base}/captures`, { cookie, body: { productId } });
const detail = (id: string, cookie = owner) =>
  h.request('GET', `${base}/captures/${id}`, { cookie });
const possibleFor = (d: CaptureDetail, method: string) =>
  d.eligibility.find((e) => e.method === method)?.possible ?? false;

async function uploadPhoto(captureId: string, view: string, cookie = owner) {
  const form = new FormData();
  form.set('meta', JSON.stringify({ kind: 'photo', view }));
  form.set('file', new Blob([fakeWebp(2200, 1600)], { type: 'image/webp' }), 'photo.webp');
  return h.request('POST', `${base}/captures/${captureId}/files`, { cookie, body: form });
}

/** A minimal, structurally valid GLB: magic, version, and a length matching the buffer. */
function glbBytes(totalLength = 64): ArrayBuffer {
  const bytes = new Uint8Array(totalLength);
  bytes.set([0x67, 0x6c, 0x54, 0x46], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  return bytes.buffer;
}

async function uploadModel(captureId: string, cookie = owner) {
  const form = new FormData();
  form.set('meta', JSON.stringify({ kind: 'model', format: 'glb' }));
  form.set('file', new Blob([glbBytes()], { type: 'model/gltf-binary' }), 'model.glb');
  return h.request('POST', `${base}/captures/${captureId}/files`, { cookie, body: form });
}

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('st-owner', [{ roleId: 'owner', site: null }]);
  editor = await h.staff('st-editor', [{ roleId: 'editor', site: null }]);
  reviewer = await h.staff('st-reviewer', [{ roleId: 'content-manager', site: null }]);
  viewer = await h.staff('st-viewer', [{ roleId: 'viewer', site: null }]);
});
afterAll(() => h.close());

describe('captures and capture checks', () => {
  it('creates a capture with no facts invented, and lets only studio.capture upload to it', async () => {
    const created = await createCapture();
    expect(created.status, await created.clone().text()).toBe(201);
    const { id } = await json<Capture>(created);
    const read = await json<CaptureDetail>(await detail(id));
    expect(read.capture).toMatchObject({ id, productId: 'prd000001', variantId: null });
    expect(read.files).toEqual([]);
    expect(read.eligibility.every((e) => !e.possible)).toBe(true);

    expect((await createCapture('prd000001', viewer)).status).toBe(403);
  });

  it('refuses a photo that is not really a WebP file, whatever the form claims', async () => {
    const { id } = await json<Capture>(await createCapture());
    const form = new FormData();
    form.set('meta', JSON.stringify({ kind: 'photo', view: 'front' }));
    form.set('file', new Blob([new Uint8Array([1, 2, 3])]), 'photo.webp');
    const response = await h.request('POST', `${base}/captures/${id}/files`, {
      cookie: owner,
      body: form,
    });
    expect(response.status).toBe(400);
  });

  it('allows an AI-estimated draft or an artist brief only once every quick-capture view is uploaded', async () => {
    const { id } = await json<Capture>(await createCapture());
    for (const view of ['front', 'left', 'right', 'rear']) {
      expect((await uploadPhoto(id, view)).status).toBe(201);
    }
    let read = await json<CaptureDetail>(await detail(id));
    expect(possibleFor(read, 'generative')).toBe(false);
    expect(possibleFor(read, 'artist')).toBe(false);

    expect((await uploadPhoto(id, 'top')).status).toBe(201);
    read = await json<CaptureDetail>(await detail(id));
    expect(possibleFor(read, 'generative')).toBe(true);
    expect(possibleFor(read, 'artist')).toBe(true);
    expect(possibleFor(read, 'photogrammetry')).toBe(false);
  });

  it('refuses a too-small photo, and never counts it toward a usable view', async () => {
    const { id } = await json<Capture>(await createCapture());
    const form = new FormData();
    form.set('meta', JSON.stringify({ kind: 'photo', view: 'front' }));
    form.set('file', new Blob([fakeWebp(400, 300)], { type: 'image/webp' }), 'small.webp');
    const response = await h.request('POST', `${base}/captures/${id}/files`, {
      cookie: owner,
      body: form,
    });
    // The server stores what was uploaded (so staff can see it was too small) but eligibility
    // never treats it as a usable "front" view.
    expect(response.status).toBe(201);
    const read = await json<CaptureDetail>(await detail(id));
    expect(possibleFor(read, 'artist')).toBe(false);
  });

  it('accepts an uploaded model file and makes photogrammetry, splat and artist all possible', async () => {
    const { id } = await json<Capture>(await createCapture());
    expect((await uploadModel(id)).status).toBe(201);
    const read = await json<CaptureDetail>(await detail(id));
    expect(possibleFor(read, 'photogrammetry')).toBe(true);
    expect(possibleFor(read, 'splat')).toBe(true);
    expect(possibleFor(read, 'artist')).toBe(true);
    expect(possibleFor(read, 'cad')).toBe(false);
  });

  it('keeps one website’s captures out of reach of another, by address', async () => {
    const created = await h.request('POST', '/api/sites', {
      cookie: owner,
      body: {
        key: 'studio-two',
        name: { ar: 'موقع', en: 'Site' },
        locales: ['ar', 'en'],
        defaultLocale: 'ar',
        template: 'product-showcase',
      },
    });
    expect(created.status).toBe(201);
    const { id } = await json<Capture>(await createCapture());
    expect(
      (await h.request('GET', `/api/sites/studio-two/studio/captures/${id}`, { cookie: owner }))
        .status,
    ).toBe(404);
  });

  it('deletes a capture whose only job is still queued, cascading that unstarted job away', async () => {
    const { id } = await json<Capture>(await createCapture());
    await uploadModel(id);
    const job = await h.request('POST', `${base}/captures/${id}/jobs`, {
      cookie: owner,
      body: { providerId: 'model-import', method: 'artist' },
    });
    expect(job.status, await job.clone().text()).toBe(201);
    expect((await h.request('DELETE', `${base}/captures/${id}`, { cookie: owner })).status).toBe(
      200,
    );
  });

  it('never deletes a capture whose job the processing runner has already started', async () => {
    const { id } = await json<Capture>(await createCapture());
    await uploadModel(id);
    const started = await json<Job>(
      await h.request('POST', `${base}/captures/${id}/jobs`, {
        cookie: owner,
        body: { providerId: 'model-import', method: 'artist' },
      }),
    );
    // Stands in for the processing runner claiming the job (tested at the database layer,
    // packages/db/src/db.test.ts, D-056): the dashboard can never do this itself.
    await h.db.update(studioJobs).set({ status: 'running' }).where(eq(studioJobs.id, started.id));
    expect((await h.request('DELETE', `${base}/captures/${id}`, { cookie: owner })).status).toBe(
      409,
    );
  });
});

describe('jobs', () => {
  it('keeps what the processing runner needs: the upload’s format and the job’s finishes', async () => {
    const { id: captureId } = await json<Capture>(await createCapture());
    const uploaded = await json<{ id: string; format: string }>(await uploadModel(captureId));
    expect(uploaded.format).toBe('glb');
    const [file] = await h.db
      .select()
      .from(studioCaptureFiles)
      .where(eq(studioCaptureFiles.id, uploaded.id));
    expect(file?.format).toBe('glb');

    const job = await json<{ id: string; finishNames: string[] }>(
      await h.request('POST', `${base}/captures/${captureId}/jobs`, {
        cookie: owner,
        body: { providerId: 'model-import', method: 'artist', finishNames: ['Matte Black'] },
      }),
    );
    expect(job.finishNames).toEqual(['Matte Black']);
    const [row] = await h.db.select().from(studioJobs).where(eq(studioJobs.id, job.id));
    expect(row?.finishNames).toEqual(['Matte Black']);
  });

  it('refuses a job that is not eligible yet, and says why', async () => {
    const { id } = await json<Capture>(await createCapture());
    const response = await h.request('POST', `${base}/captures/${id}/jobs`, {
      cookie: owner,
      body: { providerId: 'model-import', method: 'artist' },
    });
    expect(response.status).toBe(409);
    const body = await json<{ error: string; details: { reason: string } }>(response);
    expect(body.error).toBe('not-eligible');
  });

  it('refuses a provider whose processing isn’t built, and a method the provider doesn’t make', async () => {
    const { id } = await json<Capture>(await createCapture());
    await uploadModel(id);
    const cad = await h.request('POST', `${base}/captures/${id}/jobs`, {
      cookie: owner,
      body: { providerId: 'cad-step', method: 'cad' },
    });
    expect(cad.status).toBe(409);
    expect((await json<{ error: string }>(cad)).error).toBe('provider-not-implemented');

    const wrongMethod = await h.request('POST', `${base}/captures/${id}/jobs`, {
      cookie: owner,
      body: { providerId: 'model-import', method: 'generative' },
    });
    expect(wrongMethod.status).toBe(400);
  });

  it('starts a model-import job once eligible, and lets studio.capture cancel it while queued', async () => {
    const { id } = await json<Capture>(await createCapture());
    await uploadModel(id);
    const started = await h.request('POST', `${base}/captures/${id}/jobs`, {
      cookie: editor,
      body: { providerId: 'model-import', method: 'photogrammetry' },
    });
    expect(started.status, await started.clone().text()).toBe(201);
    const job = await json<Job>(started);
    expect(job.status).toBe('queued');
    expect((await h.request('GET', `${base}/jobs/${job.id}`, { cookie: viewer })).status).toBe(200);
    expect((await h.request('DELETE', `${base}/jobs/${job.id}`, { cookie: editor })).status).toBe(
      200,
    );
    expect((await h.request('GET', `${base}/jobs/${job.id}`, { cookie: owner })).status).toBe(404);
  });
});

describe('review and approval', () => {
  /**
   * A model's result is only ever written by the processing runner (proved at the database
   * layer in packages/db/src/db.test.ts, D-056); this stands in for that write so the API's own
   * review and approval steps can be tested on their own.
   */
  const passingResult = {
    measurements: {
      desktop: { bytes: 1_500_000, triangles: 90_000, maxTextureSize: 2048 },
      mobile: { bytes: 800_000, triangles: 45_000, maxTextureSize: 1024 },
      boundingBoxMm: { width: 86, height: 86, depth: 12 },
      primitivesWithoutMaterial: 0,
    },
    validatorReport: {
      desktop: { numErrors: 0, numWarnings: 0, messages: [] },
      mobile: { numErrors: 0, numWarnings: 0, messages: [] },
    },
    withinScale: true,
  };

  async function readyModel(result: Partial<typeof passingResult> = {}) {
    const { id: captureId } = await json<Capture>(await createCapture());
    await uploadModel(captureId);
    const job = await json<Job>(
      await h.request('POST', `${base}/captures/${captureId}/jobs`, {
        cookie: owner,
        body: { providerId: 'model-import', method: 'artist' },
      }),
    );
    const [model] = await h.db
      .insert(studioModels)
      .values({
        siteId: h.sites.a,
        captureId,
        jobId: job.id,
        label: 'artist-modelled',
        files: {},
        ...passingResult,
        ...result,
      })
      .returning();
    return { captureId, jobId: job.id, modelId: model!.id };
  }

  it('refuses to review or approve a model that does not exist yet', async () => {
    const response = await h.request(
      'POST',
      `${base}/models/${'0'.repeat(8)}-0000-0000-0000-000000000000/review`,
      { cookie: owner, body: { checklist: {}, decision: 'ready-for-approval' } },
    );
    expect(response.status).toBe(404);
  });

  it('lets studio.review file a checklist, and never approves without one first', async () => {
    const { modelId } = await readyModel();
    expect(
      (await h.request('POST', `${base}/models/${modelId}/approve`, { cookie: owner })).status,
    ).toBe(409);

    const review = await h.request('POST', `${base}/models/${modelId}/review`, {
      cookie: reviewer,
      body: {
        checklist: { shape: true, buttons: true, openings: true, finish: true },
        decision: 'needs-manual-correction',
        notes: 'The rocker is the wrong width.',
      },
    });
    expect(review.status, await review.clone().text()).toBe(201);
    const [row] = await h.db.select().from(studioModels).where(eq(studioModels.id, modelId));
    expect(row?.reviewStatus).toBe('needs-manual-correction');

    const second = await h.request('POST', `${base}/models/${modelId}/review`, {
      cookie: reviewer,
      body: { checklist: { shape: true }, decision: 'ready-for-approval', notes: '' },
    });
    expect(second.status).toBe(201);
  });

  it('approves a reviewed model only for someone with studio.approve (Owner, by default)', async () => {
    const { modelId } = await readyModel();
    await h.request('POST', `${base}/models/${modelId}/review`, {
      cookie: reviewer,
      body: { checklist: { shape: true }, decision: 'ready-for-approval', notes: '' },
    });
    expect(
      (await h.request('POST', `${base}/models/${modelId}/approve`, { cookie: reviewer })).status,
    ).toBe(403);
    const approved = await h.request('POST', `${base}/models/${modelId}/approve`, {
      cookie: owner,
    });
    expect(approved.status, await approved.clone().text()).toBe(200);
    const [row] = await h.db.select().from(studioModels).where(eq(studioModels.id, modelId));
    expect(row?.approvedAt).toBeInstanceOf(Date);
  });
});

describe('the technical gate', () => {
  const failing = {
    measurements: {
      desktop: { bytes: 5_000_000, triangles: 90_000, maxTextureSize: 2048 },
      mobile: { bytes: 800_000, triangles: 45_000, maxTextureSize: 1024 },
      boundingBoxMm: { width: 86, height: 86, depth: 12 },
      primitivesWithoutMaterial: 0,
    },
    validatorReport: {
      desktop: { numErrors: 0, numWarnings: 0, messages: [] },
      mobile: { numErrors: 3, numWarnings: 0, messages: [] },
    },
    withinScale: false,
  };

  async function failingModel() {
    const { id: captureId } = await json<Capture>(await createCapture());
    await uploadModel(captureId);
    const job = await json<Job>(
      await h.request('POST', `${base}/captures/${captureId}/jobs`, {
        cookie: owner,
        body: { providerId: 'model-import', method: 'artist' },
      }),
    );
    const [model] = await h.db
      .insert(studioModels)
      .values({
        siteId: h.sites.a,
        captureId,
        jobId: job.id,
        label: 'artist-modelled',
        files: {},
        ...failing,
      })
      .returning();
    return model!.id;
  }

  it('shows what a model fails, and never lets it be marked ready for approval', async () => {
    const modelId = await failingModel();
    const shown = await json<{ model: { technicalIssues: { check: string }[] } }>(
      await h.request('GET', `${base}/models/${modelId}`, { cookie: viewer }),
    );
    expect(shown.model.technicalIssues.map((i) => i.check).sort()).toEqual([
      'budget',
      'scale',
      'validator',
    ]);

    const ready = await h.request('POST', `${base}/models/${modelId}/review`, {
      cookie: reviewer,
      body: { checklist: { shape: true }, decision: 'ready-for-approval', notes: '' },
    });
    expect(ready.status).toBe(409);
    expect(await json<{ error: string }>(ready)).toMatchObject({ error: 'technical-gate' });

    const correction = await h.request('POST', `${base}/models/${modelId}/review`, {
      cookie: reviewer,
      body: { checklist: { shape: true }, decision: 'needs-manual-correction', notes: '' },
    });
    expect(correction.status).toBe(201);
  });

  it('refuses approval of a failing model even if its review status says ready', async () => {
    const modelId = await failingModel();
    await h.db
      .update(studioModels)
      .set({ reviewStatus: 'ready-for-approval' })
      .where(eq(studioModels.id, modelId));
    const approved = await h.request('POST', `${base}/models/${modelId}/approve`, {
      cookie: owner,
    });
    expect(approved.status).toBe(409);
    const [row] = await h.db.select().from(studioModels).where(eq(studioModels.id, modelId));
    expect(row?.approvedAt).toBeNull();
  });
});

describe('providers and budget', () => {
  it('lists the two stage-1 providers, with cad-step marked as not yet built', async () => {
    const response = await h.request('GET', `${base}/providers`, { cookie: owner });
    const body = await json<{ providers: { id: string; implemented: boolean }[] }>(response);
    const byId = new Map(body.providers.map((p) => [p.id, p]));
    expect(byId.get('model-import')?.implemented).toBe(true);
    expect(byId.get('cad-step')?.implemented).toBe(false);
  });

  it('lets only studio.manage (Owner) change a provider’s budget, and nobody else view spend', async () => {
    expect(
      (
        await h.request('PUT', `${base}/providers/model-import`, {
          cookie: editor,
          body: { enabled: true, budgetCents: 1000 },
        })
      ).status,
    ).toBe(403);
    const changed = await h.request('PUT', `${base}/providers/model-import`, {
      cookie: owner,
      body: { enabled: true, budgetCents: 1000 },
    });
    expect(changed.status, await changed.clone().text()).toBe(200);
    const [row] = await h.db
      .select()
      .from(studioProviderSettings)
      .where(eq(studioProviderSettings.providerId, 'model-import'));
    expect(row).toMatchObject({ enabled: true, budgetCents: 1000 });
    expect((await h.request('GET', `${base}/spend`, { cookie: editor })).status).toBe(403);
    expect((await h.request('GET', `${base}/spend`, { cookie: owner })).status).toBe(200);
  });

  it('refuses an unknown provider id', async () => {
    const response = await h.request('PUT', `${base}/providers/not-a-provider`, {
      cookie: owner,
      body: { enabled: true, budgetCents: 0 },
    });
    expect(response.status).toBe(404);
  });
});
