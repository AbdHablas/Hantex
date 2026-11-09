import {
  studioCaptureFiles,
  studioCaptures,
  studioJobs,
  studioModels,
  studioProviderSettings,
  studioReviews,
  studioSpend,
  type Database,
} from '@hantex/db/worker';
import {
  METHODS,
  canCheckTrueScale,
  eligibility,
  providerById,
  PROVIDERS,
  REVIEW_CHECKS,
  studioCaptureFileKey,
  technicalGate,
  type ResultLabel,
} from '@hantex/studio';
import { itemId } from '@hantex/sections';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { readWebp } from '../lib/webp';
import {
  checkCadFile,
  checkModelFile,
  MAX_MODEL_BYTES,
  MAX_PHOTO_BYTES,
  type CadFormat,
  type ModelFormat,
} from '../lib/model-file';
import {
  captureSummary,
  providerSettings,
  spentThisMonth,
  startOfBudgetMonth,
  studioStoredBytes,
} from '../lib/studio-content';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/session';

/**
 * The AI 3D Product Studio (D-029, D-030, D-056): captures, processing jobs, review and
 * approval. Nothing here calls a provider directly — a job is recorded as `queued` and the
 * processing runner, a separate process the Owner runs on their own hardware (never
 * Cloudflare), does the actual work and reports back through its own database role. This API
 * only ever shows what the runner actually produced; see docs/3d-product-studio.md.
 */

const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });
const idParam = validate('param', z.object({ id: z.uuid() }));
const fileParam = validate('param', z.object({ id: z.uuid(), fileId: z.uuid() }));

/** A processed model's files, as the runner stores them (apps/studio-runner/src/process-job.ts). */
const MODEL_FILES = {
  desktop: 'model/gltf-binary',
  mobile: 'model/gltf-binary',
  posterFront: 'image/webp',
  posterThreeQuarter: 'image/webp',
} as const;

/**
 * Private Studio files for signed-in staff: a checked WebP photo or poster and a GLB the
 * dashboard's viewer reads are served as themselves, any other upload (glTF JSON, OBJ, USDZ,
 * FBX, STEP, IGES) only as a download. The security middleware adds what every API response
 * carries: never cached, never sniffed, and a policy under which nothing in it can run.
 */
function studioFile(
  stored: { body: ReadableStream | ArrayBuffer; size: number },
  contentType: string,
  download: string | null,
) {
  return new Response(stored.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stored.size),
      ...(download ? { 'Content-Disposition': `attachment; filename="${download}"` } : {}),
    },
  });
}
const CAPTURE_VIEWS = ['front', 'left', 'right', 'rear', 'top', 'detail'] as const;

const captureBody = z.strictObject({
  productId: z.string().regex(/^[a-z0-9]{6,24}$/),
  variantId: z
    .string()
    .regex(/^[a-z0-9]{6,24}$/)
    .nullable()
    .default(null),
  widthMm: z.number().int().min(1).max(10_000).nullable().default(null),
  heightMm: z.number().int().min(1).max(10_000).nullable().default(null),
  depthMm: z.number().int().min(1).max(10_000).nullable().default(null),
});

const asCapture = (row: typeof studioCaptures.$inferSelect) => ({
  id: row.id,
  productId: row.productId,
  variantId: row.variantId,
  dimensionsMm:
    row.widthMm !== null && row.heightMm !== null && row.depthMm !== null
      ? { width: row.widthMm, height: row.heightMm, depth: row.depthMm }
      : null,
  createdAt: row.createdAt,
});

const asFile = (row: typeof studioCaptureFiles.$inferSelect) => ({
  id: row.id,
  kind: row.kind,
  view: row.view,
  format: row.format,
  bytes: row.bytes,
  widthPx: row.widthPx,
  heightPx: row.heightPx,
  createdAt: row.createdAt,
});

const asJob = (row: typeof studioJobs.$inferSelect) => ({
  id: row.id,
  captureId: row.captureId,
  providerId: row.providerId,
  method: row.method,
  finishIds: row.finishIds,
  status: row.status,
  detail: row.detail,
  estimatedCostCents: row.estimatedCostCents,
  actualCostCents: row.actualCostCents,
  createdAt: row.createdAt,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
});

/** What the technical gate (D-029 §6) finds in a processed model; empty when it passes. */
const technicalIssuesOf = (row: typeof studioModels.$inferSelect) =>
  technicalGate({
    label: row.label as ResultLabel,
    measurements: row.measurements,
    validatorReport: row.validatorReport,
    withinScale: row.withinScale,
  });

const asModel = (row: typeof studioModels.$inferSelect) => ({
  id: row.id,
  captureId: row.captureId,
  jobId: row.jobId,
  label: row.label,
  files: row.files,
  measurements: row.measurements,
  validatorReport: row.validatorReport,
  withinScale: row.withinScale,
  technicalIssues: technicalIssuesOf(row),
  reviewStatus: row.reviewStatus,
  approvedAt: row.approvedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** The one capture of this site, or a 404 — every route below is scoped by this. */
async function requireCapture(db: Database, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(studioCaptures)
    .where(and(eq(studioCaptures.id, id), eq(studioCaptures.siteId, siteId)));
  if (!row) throw notFound();
  return row;
}

export const studioRoutes = new Hono<AppEnv>()
  /* ---------------------------------------------- Providers ---------------------------------------------- */

  .get('/providers', requirePermission('studio.view'), async (c) => {
    const v = c.var;
    const settings = await v.db
      .select()
      .from(studioProviderSettings)
      .where(eq(studioProviderSettings.siteId, v.site.id));
    const byId = new Map(settings.map((s) => [s.providerId, s]));
    return c.json({
      providers: PROVIDERS.map((p) => {
        const row = byId.get(p.id);
        return {
          id: p.id,
          methods: p.methods,
          runsOn: p.runsOn,
          implemented: p.implemented,
          requires: p.requires,
          dataPolicy: p.dataPolicy,
          enabled: row?.enabled ?? false,
          budgetCents: row?.budgetCents ?? 0,
        };
      }),
    });
  })

  .put(
    '/providers/:id',
    requirePermission('studio.manage'),
    validate('param', z.object({ id: z.string() })),
    validate(
      'json',
      z.strictObject({
        enabled: z.boolean(),
        budgetCents: z.number().int().min(0).max(100_000_00),
      }),
    ),
    async (c) => {
      const v = c.var;
      const providerId = c.req.valid('param').id;
      if (!providerById(providerId)) throw notFound();
      const body = c.req.valid('json');
      await v.db
        .insert(studioProviderSettings)
        .values({
          siteId: v.site.id,
          providerId,
          enabled: body.enabled,
          budgetCents: body.budgetCents,
          dataPolicyAcceptedBy: v.access.userId,
        })
        .onConflictDoUpdate({
          target: [studioProviderSettings.siteId, studioProviderSettings.providerId],
          set: {
            enabled: body.enabled,
            budgetCents: body.budgetCents,
            dataPolicyAcceptedBy: v.access.userId,
            updatedAt: new Date(),
          },
        });
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'studio.provider-settings-changed',
          siteId: v.site.id,
          targetType: 'studio-provider',
          targetId: providerId,
          details: { enabled: body.enabled, budgetCents: body.budgetCents },
        },
        v.requestId,
      );
      return c.json({ ok: true });
    },
  )

  .get('/spend', requirePermission('studio.manage'), async (c) => {
    const v = c.var;
    const rows = await v.db
      .select()
      .from(studioSpend)
      .where(eq(studioSpend.siteId, v.site.id))
      .orderBy(desc(studioSpend.createdAt))
      .limit(200);
    return c.json({
      items: rows.map((r) => ({
        id: r.id,
        providerId: r.providerId,
        jobId: r.jobId,
        cents: r.cents,
        createdAt: r.createdAt,
      })),
      monthStartsAt: startOfBudgetMonth(),
    });
  })

  /* ----------------------------------------------- Captures ----------------------------------------------- */

  .get('/captures', requirePermission('studio.view'), async (c) => {
    const v = c.var;
    const rows = await v.db
      .select()
      .from(studioCaptures)
      .where(eq(studioCaptures.siteId, v.site.id))
      .orderBy(desc(studioCaptures.createdAt))
      .limit(200);
    return c.json({ items: rows.map(asCapture) });
  })

  .post(
    '/captures',
    requirePermission('studio.capture'),
    validate('json', captureBody),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      const [row] = await v.db
        .insert(studioCaptures)
        .values({
          siteId: v.site.id,
          productId: body.productId,
          variantId: body.variantId,
          widthMm: body.widthMm,
          heightMm: body.heightMm,
          depthMm: body.depthMm,
          createdBy: v.access.userId,
        })
        .returning();
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'studio.capture-created',
          siteId: v.site.id,
          targetType: 'studio-capture',
          targetId: row!.id,
          details: { productId: body.productId },
        },
        v.requestId,
      );
      return c.json(asCapture(row!), 201);
    },
  )

  .get('/captures/:id', requirePermission('studio.view'), idParam, async (c) => {
    const v = c.var;
    const capture = await requireCapture(v.db, v.site.id, c.req.valid('param').id);
    const [files, jobs, models, data] = await Promise.all([
      v.db.select().from(studioCaptureFiles).where(eq(studioCaptureFiles.captureId, capture.id)),
      v.db
        .select()
        .from(studioJobs)
        .where(eq(studioJobs.captureId, capture.id))
        .orderBy(desc(studioJobs.createdAt)),
      v.db
        .select()
        .from(studioModels)
        .where(eq(studioModels.captureId, capture.id))
        .orderBy(desc(studioModels.createdAt)),
      captureSummary(v.db, capture.id),
    ]);
    return c.json({
      capture: asCapture(capture),
      files: files.map(asFile),
      jobs: jobs.map(asJob),
      models: models.map(asModel),
      eligibility: data ? eligibility(data.summary) : [],
      canCheckTrueScale: data ? canCheckTrueScale(data.summary) : false,
    });
  })

  .delete('/captures/:id', requirePermission('studio.capture'), idParam, async (c) => {
    const v = c.var;
    const capture = await requireCapture(v.db, v.site.id, c.req.valid('param').id);
    // A capture with a job already running (or further along) is never deleted: its files are
    // the job's input, and its models are its output.
    const jobs = await v.db
      .select({ id: studioJobs.id, status: studioJobs.status })
      .from(studioJobs)
      .where(eq(studioJobs.captureId, capture.id));
    if (jobs.some((j) => j.status !== 'queued' && j.status !== 'failed')) {
      throw conflict('capture-in-use');
    }
    const files = await v.db
      .select({ id: studioCaptureFiles.id })
      .from(studioCaptureFiles)
      .where(eq(studioCaptureFiles.captureId, capture.id));
    await v.deps
      .studio(c.env)
      .delete(files.map((f) => studioCaptureFileKey(v.site.id, capture.id, f.id)));
    await v.db.delete(studioCaptures).where(eq(studioCaptures.id, capture.id));
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'studio.capture-deleted',
        siteId: v.site.id,
        targetType: 'studio-capture',
        targetId: capture.id,
      },
      v.requestId,
    );
    return c.json({ ok: true });
  })

  /* --------------------------------------------- Capture files --------------------------------------------- */

  /**
   * multipart/form-data: `meta` (JSON: kind, view for photos, format for model/cad uploads) and
   * one file, `file`. Photos are WebP, encoded on the device exactly like the media library
   * (D-044), which is also what strips camera and location data; the server re-measures their
   * real pixel size and never trusts the upload form. Model and CAD files get only the honest
   * check `lib/model-file.ts` can do from the bytes; the real check is the processing runner
   * actually reading the file.
   */
  .post(
    '/captures/:id/files',
    requirePermission('studio.capture'),
    idParam,
    bodyLimit({
      maxSize: MAX_MODEL_BYTES + 64 * 1024,
      onError: () => {
        throw badRequest('file-too-large');
      },
    }),
    async (c) => {
      const v = c.var;
      const capture = await requireCapture(v.db, v.site.id, c.req.valid('param').id);
      const form = await c.req.formData().catch(() => null);
      if (!form) throw badRequest('invalid-input');
      let parsedMeta: unknown = null;
      try {
        const raw = form.get('meta');
        parsedMeta = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : null;
      } catch {
        // Reported below.
      }
      const metaSchema = z.strictObject({
        kind: z.enum(['photo', 'cad', 'model']),
        view: z.enum(CAPTURE_VIEWS).optional(),
        format: z.enum(['glb', 'gltf', 'obj', 'usdz', 'fbx', 'step', 'iges']).optional(),
      });
      const meta = metaSchema.safeParse(parsedMeta);
      if (!meta.success) throw badRequest('invalid-input');
      if (meta.data.kind === 'photo' && !meta.data.view) throw badRequest('invalid-input');
      const fields = [...form.keys()];
      const file = form.get('file');
      if (fields.length !== 2 || !file || typeof file === 'string')
        throw badRequest('invalid-file');

      const data = new Uint8Array(await file.arrayBuffer());
      let widthPx: number | null = null;
      let heightPx: number | null = null;
      let format: string;

      if (meta.data.kind === 'photo') {
        if (data.byteLength > MAX_PHOTO_BYTES) throw badRequest('file-too-large');
        const info = readWebp(data.buffer);
        if (!info) throw badRequest('invalid-file', { reason: 'not-webp' });
        widthPx = info.width;
        heightPx = info.height;
        format = 'webp';
      } else if (meta.data.kind === 'model') {
        const modelFormat = meta.data.format as ModelFormat | undefined;
        if (!modelFormat || !['glb', 'gltf', 'obj', 'usdz', 'fbx'].includes(modelFormat)) {
          throw badRequest('invalid-input');
        }
        const result = checkModelFile(data, modelFormat);
        if (!result.ok) throw badRequest('invalid-file', { reason: result.reason });
        format = modelFormat;
      } else {
        const cadFormat = meta.data.format as CadFormat | undefined;
        if (!cadFormat || !['step', 'iges'].includes(cadFormat)) throw badRequest('invalid-input');
        const result = checkCadFile(data, cadFormat);
        if (!result.ok) throw badRequest('invalid-file', { reason: result.reason });
        format = cadFormat;
      }

      const quotaMb = Number(c.env.STUDIO_SITE_QUOTA_MB ?? 5120);
      const quotaBytes = (Number.isFinite(quotaMb) && quotaMb > 0 ? quotaMb : 5120) * 1024 * 1024;
      if ((await studioStoredBytes(v.db, v.site.id)) + data.byteLength > quotaBytes) {
        throw conflict('studio-quota');
      }

      const [row] = await v.db
        .insert(studioCaptureFiles)
        .values({
          captureId: capture.id,
          kind: meta.data.kind,
          view: meta.data.view ?? null,
          format,
          storageKey: '',
          bytes: data.byteLength,
          widthPx,
          heightPx,
        })
        .returning();
      const key = studioCaptureFileKey(v.site.id, capture.id, row!.id);
      await v.db
        .update(studioCaptureFiles)
        .set({ storageKey: key })
        .where(eq(studioCaptureFiles.id, row!.id));
      await v.deps.studio(c.env).put(key, data.buffer, 'application/octet-stream');
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'studio.file-uploaded',
          siteId: v.site.id,
          targetType: 'studio-capture-file',
          targetId: row!.id,
          details: { captureId: capture.id, kind: meta.data.kind, bytes: data.byteLength },
        },
        v.requestId,
      );
      return c.json(asFile({ ...row!, storageKey: key }), 201);
    },
  )

  .delete(
    '/captures/:id/files/:fileId',
    requirePermission('studio.capture'),
    fileParam,
    async (c) => {
      const v = c.var;
      const { id, fileId } = c.req.valid('param');
      const capture = await requireCapture(v.db, v.site.id, id);
      const [row] = await v.db
        .delete(studioCaptureFiles)
        .where(and(eq(studioCaptureFiles.id, fileId), eq(studioCaptureFiles.captureId, capture.id)))
        .returning();
      if (!row) throw notFound();
      await v.deps.studio(c.env).delete([row.storageKey]);
      return c.json({ ok: true });
    },
  )

  .get(
    '/captures/:id/files/:fileId/content',
    requirePermission('studio.view'),
    fileParam,
    async (c) => {
      const v = c.var;
      const { id, fileId } = c.req.valid('param');
      const capture = await requireCapture(v.db, v.site.id, id);
      const [row] = await v.db
        .select()
        .from(studioCaptureFiles)
        .where(
          and(eq(studioCaptureFiles.id, fileId), eq(studioCaptureFiles.captureId, capture.id)),
        );
      if (!row) throw notFound();
      const stored = await v.deps.studio(c.env).get(row.storageKey);
      if (!stored) throw notFound();
      if (row.format === 'webp') return studioFile(stored, 'image/webp', null);
      if (row.format === 'glb') return studioFile(stored, 'model/gltf-binary', null);
      return studioFile(stored, 'application/octet-stream', `${row.id}.${row.format}`);
    },
  )

  /* ------------------------------------------------- Jobs ------------------------------------------------- */

  .post(
    '/captures/:id/jobs',
    requirePermission('studio.capture'),
    idParam,
    validate(
      'json',
      z.strictObject({
        providerId: z.string(),
        method: z.enum(METHODS),
        // Catalogue finish ids: each names a material variant in the model (D-056).
        finishIds: z.array(itemId).max(60).default([]),
      }),
    ),
    async (c) => {
      const v = c.var;
      const capture = await requireCapture(v.db, v.site.id, c.req.valid('param').id);
      const body = c.req.valid('json');
      const provider = providerById(body.providerId);
      if (!provider) throw badRequest('unknown-provider');
      if (!provider.implemented) throw conflict('provider-not-implemented');
      if (!provider.methods.includes(body.method)) throw badRequest('method-mismatch');

      const data = await captureSummary(v.db, capture.id);
      const allowed = data ? eligibility(data.summary).find((e) => e.method === body.method) : null;
      if (!allowed?.possible) throw conflict('not-eligible', { reason: allowed?.reason });

      const settings = await providerSettings(v.db, v.site.id, provider.id);
      // Free providers (stage 1) always cost $0; a paid provider needs the Owner to have
      // switched it on, with a budget that covers at least this job's estimated cost.
      const estimatedCostCents = 0;
      if (estimatedCostCents > 0) {
        if (!settings.enabled) throw forbidden('provider-disabled');
        const spent = await spentThisMonth(v.db, v.site.id, provider.id);
        if (spent + estimatedCostCents > settings.budgetCents) throw conflict('over-budget');
      }

      const [row] = await v.db
        .insert(studioJobs)
        .values({
          siteId: v.site.id,
          captureId: capture.id,
          providerId: provider.id,
          method: body.method,
          finishIds: body.finishIds,
          estimatedCostCents,
          createdBy: v.access.userId,
        })
        .returning();
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'studio.job-started',
          siteId: v.site.id,
          targetType: 'studio-job',
          targetId: row!.id,
          details: { captureId: capture.id, providerId: provider.id, method: body.method },
        },
        v.requestId,
      );
      return c.json(asJob(row!), 201);
    },
  )

  .get('/jobs/:id', requirePermission('studio.view'), idParam, async (c) => {
    const v = c.var;
    const [row] = await v.db
      .select()
      .from(studioJobs)
      .where(and(eq(studioJobs.id, c.req.valid('param').id), eq(studioJobs.siteId, v.site.id)));
    if (!row) throw notFound();
    return c.json(asJob(row));
  })

  .delete('/jobs/:id', requirePermission('studio.capture'), idParam, async (c) => {
    const v = c.var;
    const [row] = await v.db
      .delete(studioJobs)
      .where(
        and(
          eq(studioJobs.id, c.req.valid('param').id),
          eq(studioJobs.siteId, v.site.id),
          eq(studioJobs.status, 'queued'),
        ),
      )
      .returning();
    if (!row) throw notFound();
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'studio.job-cancelled',
        siteId: v.site.id,
        targetType: 'studio-job',
        targetId: row.id,
      },
      v.requestId,
    );
    return c.json({ ok: true });
  })

  /* ------------------------------------------------ Models ------------------------------------------------ */

  .get('/models/:id', requirePermission('studio.view'), idParam, async (c) => {
    const v = c.var;
    const [row] = await v.db
      .select()
      .from(studioModels)
      .where(and(eq(studioModels.id, c.req.valid('param').id), eq(studioModels.siteId, v.site.id)));
    if (!row) throw notFound();
    const reviews = await v.db
      .select()
      .from(studioReviews)
      .where(eq(studioReviews.modelId, row.id))
      .orderBy(desc(studioReviews.createdAt));
    return c.json({
      model: asModel(row),
      reviews: reviews.map((r) => ({
        id: r.id,
        checklist: r.checklist,
        decision: r.decision,
        notes: r.notes,
        createdAt: r.createdAt,
      })),
    });
  })

  .get(
    '/models/:id/files/:file',
    requirePermission('studio.view'),
    validate(
      'param',
      z.object({
        id: z.uuid(),
        file: z.enum(Object.keys(MODEL_FILES) as [keyof typeof MODEL_FILES]),
      }),
    ),
    async (c) => {
      const v = c.var;
      const { id, file } = c.req.valid('param');
      const [row] = await v.db
        .select({ files: studioModels.files })
        .from(studioModels)
        .where(and(eq(studioModels.id, id), eq(studioModels.siteId, v.site.id)));
      const key = (row?.files as Partial<Record<keyof typeof MODEL_FILES, string>> | undefined)?.[
        file
      ];
      if (!key) throw notFound();
      const stored = await v.deps.studio(c.env).get(key);
      if (!stored) throw notFound();
      return studioFile(stored, MODEL_FILES[file], null);
    },
  )

  .post(
    '/models/:id/review',
    requirePermission('studio.review'),
    idParam,
    validate(
      'json',
      z.strictObject({
        checklist: z.partialRecord(z.enum(REVIEW_CHECKS), z.boolean()),
        decision: z.enum(['ready-for-approval', 'needs-better-photos', 'needs-manual-correction']),
        notes: z.string().trim().max(2000).default(''),
      }),
    ),
    async (c) => {
      const v = c.var;
      const [model] = await v.db
        .select()
        .from(studioModels)
        .where(
          and(eq(studioModels.id, c.req.valid('param').id), eq(studioModels.siteId, v.site.id)),
        );
      if (!model) throw notFound();
      const body = c.req.valid('json');
      if (body.decision === 'ready-for-approval') {
        // A model failing the technical gate needs manual correction, whatever the reviewer saw.
        const issues = technicalIssuesOf(model);
        if (issues.length > 0) throw conflict('technical-gate', { issues });
        // And "ready" means every feature was checked, not just some.
        if (!REVIEW_CHECKS.every((check) => body.checklist[check] === true)) {
          throw badRequest('checklist-incomplete');
        }
      }
      const [review] = await v.db
        .insert(studioReviews)
        .values({
          modelId: model.id,
          reviewerId: v.access.userId,
          checklist: body.checklist,
          decision: body.decision,
          notes: body.notes,
        })
        .returning();
      await v.db
        .update(studioModels)
        .set({ reviewStatus: body.decision, updatedAt: new Date() })
        .where(eq(studioModels.id, model.id));
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'studio.model-reviewed',
          siteId: v.site.id,
          targetType: 'studio-model',
          targetId: model.id,
          details: { decision: body.decision },
        },
        v.requestId,
      );
      return c.json({ id: review!.id }, 201);
    },
  )

  .post('/models/:id/approve', requirePermission('studio.approve'), idParam, async (c) => {
    const v = c.var;
    const [model] = await v.db
      .select()
      .from(studioModels)
      .where(and(eq(studioModels.id, c.req.valid('param').id), eq(studioModels.siteId, v.site.id)));
    if (!model) throw notFound();
    if (model.reviewStatus !== 'ready-for-approval') throw conflict('not-reviewed');
    const issues = technicalIssuesOf(model);
    if (issues.length > 0) throw conflict('technical-gate', { issues });
    const [row] = await v.db
      .update(studioModels)
      .set({ approvedBy: v.access.userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(studioModels.id, model.id))
      .returning();
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'studio.model-approved',
        siteId: v.site.id,
        targetType: 'studio-model',
        targetId: model.id,
        details: { label: model.label },
      },
      v.requestId,
    );
    return c.json(asModel(row!));
  });
