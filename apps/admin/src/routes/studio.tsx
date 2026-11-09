import {
  CAPTURE_VIEWS,
  QUICK_CAPTURE_VIEWS,
  REVIEW_CHECKS,
  type CaptureView,
  type Method,
  type TechnicalIssue,
} from '@hantex/studio';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, CheckCircle2, Download, Images, Plus, Trash2, Upload } from 'lucide-react';
import { Suspense, lazy, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
  Textarea,
  confirmAction,
  later,
  toast,
} from '../components/ui';
import { PublishBar } from '../components/builder/PublishBar';
import { api, sitePath } from '../lib/api';
import { useCatalogue, useProduct } from '../lib/catalogue';
import { useBilingual, useI18n } from '../lib/i18n';
import { ImageError, formatBytes } from '../lib/media';
import { useCurrentSite } from '../lib/session';
import {
  IMPORT_METHODS,
  captureForm,
  encodeCapturePhoto,
  modelFormatOf,
  type CaptureDetail,
  type ModelFile,
  type ReviewDecision,
  type StudioCapture,
  type StudioModel,
  type StudioProvider,
  type StudioReview,
} from '../lib/studio';

/**
 * The 3D Product Studio (D-029, D-056): a capture per product, the finished model uploaded to
 * it, jobs for the processing runner, and each resulting model's technical checks, review and
 * approval. Approval never publishes anything: the website shows a model only once published.
 */

const ModelViewer = lazy(() => import('../components/ModelViewer'));

const studioPath = (siteKey: string, path = '') => sitePath(siteKey, `/studio${path}`);
const fileUrl = (siteKey: string, captureId: string, fileId: string) =>
  `/api${studioPath(siteKey, `/captures/${captureId}/files/${fileId}/content`)}`;
const modelFileUrl = (siteKey: string, modelId: string, file: ModelFile) =>
  `/api${studioPath(siteKey, `/models/${modelId}/files/${file}`)}`;

function useStudioKeys() {
  const { siteKey } = useCurrentSite();
  const base = ['site', siteKey, 'studio'] as const;
  return { siteKey, base, capture: (id: string) => [...base, 'capture', id] as const };
}

/** Product names by id, from the catalogue (the Studio stores only the id, D-045). */
function useProductNames() {
  const catalogue = useCatalogue();
  const bilingual = useBilingual();
  const names = new Map(
    (catalogue.data?.products ?? []).map((p) => [p.id, bilingual(p.name)] as const),
  );
  return { catalogue, nameOf: (id: string) => names.get(id) || id };
}

/* ------------------------------------------------ Home ------------------------------------------------ */

export function StudioHome() {
  const { site, can } = useCurrentSite();
  const { m, date, format } = useI18n();
  const t = m.studio;
  const keys = useStudioKeys();
  const { nameOf } = useProductNames();
  const captures = useQuery({
    queryKey: keys.base,
    queryFn: () => api<{ items: StudioCapture[] }>(studioPath(keys.siteKey, '/captures')),
    enabled: site !== null,
  });
  const providers = useQuery({
    queryKey: [...keys.base, 'providers'],
    queryFn: () => api<{ providers: StudioProvider[] }>(studioPath(keys.siteKey, '/providers')),
    enabled: site !== null,
  });
  if (!site) return <Navigate to="/" replace />;
  const items = captures.data?.items ?? [];
  return (
    <>
      <PageHeader title={t.title} intro={t.intro} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          {can('studio.capture') && <NewCapture />}
          <Card title={t.captures} icon={<Box />}>
            <ErrorText error={captures.error} />
            {captures.isPending ? (
              <Loading />
            ) : items.length === 0 ? (
              <EmptyState icon={<Box />} title={t.noCaptures} />
            ) : (
              <ul className="grid gap-2" aria-label={t.captures}>
                {items.map((capture) => (
                  <li key={capture.id}>
                    <Link
                      to={capture.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-4 hover:bg-surface-2"
                    >
                      <span className="font-medium">{nameOf(capture.productId)}</span>
                      <span className="text-sm text-muted">
                        {capture.dimensionsMm ? format(t.sizeOf, capture.dimensionsMm) : t.noSize}
                        {' · '}
                        {date(capture.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title={t.howItWorks} className="content-start">
          <p className="text-sm">{t.howItWorksText}</p>
          <p className="mt-3 text-sm text-muted">{t.notBuiltYet}</p>
          <h3 className="mt-5 text-sm font-semibold">{t.providers}</h3>
          <ul className="mt-2 grid gap-2">
            {(providers.data?.providers ?? []).map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">{t.providerNames[p.id] ?? p.id}</span>
                <span className="shrink-0 whitespace-nowrap">
                  <Badge tone={p.implemented ? 'success' : 'neutral'}>
                    {p.implemented ? t.free : t.notBuilt}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function NewCapture() {
  const { m } = useI18n();
  const t = m.studio;
  const keys = useStudioKeys();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bilingual = useBilingual();
  const { catalogue } = useProductNames();
  const [productId, setProductId] = useState('');
  const [size, setSize] = useState({ width: '', height: '', depth: '' });
  const create = useMutation({
    mutationFn: () => {
      const mm = (value: string) => (value.trim() === '' ? null : Math.round(Number(value)));
      return api<StudioCapture>(studioPath(keys.siteKey, '/captures'), {
        method: 'POST',
        body: {
          productId,
          widthMm: mm(size.width),
          heightMm: mm(size.height),
          depthMm: mm(size.depth),
        },
      });
    },
    onSuccess: async (capture) => {
      await queryClient.invalidateQueries({ queryKey: keys.base });
      void navigate(capture.id);
    },
  });
  const products = catalogue.data?.products ?? [];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  return (
    <Card title={t.newCapture} description={t.newCaptureIntro} icon={<Plus />}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label={t.product} help={products.length === 0 ? t.noProducts : undefined}>
          {(props) => (
            <Select
              {...props}
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">{t.chooseProduct}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {bilingual(p.name)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t.dimensions}</legend>
          <div className="grid grid-cols-3 gap-3">
            {(['width', 'height', 'depth'] as const).map((side) => (
              <Field key={side} label={t[side]}>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10000}
                    step={1}
                    dir="ltr"
                    value={size[side]}
                    onChange={(e) => setSize({ ...size, [side]: e.target.value })}
                  />
                )}
              </Field>
            ))}
          </div>
          <p className="text-xs text-muted">{t.dimensionsHelp}</p>
        </fieldset>
        <ErrorText error={create.error} />
        <div>
          <Button type="submit" busy={create.isPending} disabled={productId === ''}>
            {t.createCapture}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ----------------------------------------------- Capture ----------------------------------------------- */

export function StudioCapturePage() {
  const { captureId = '' } = useParams();
  const { site, can } = useCurrentSite();
  const { m, format } = useI18n();
  const t = m.studio;
  const keys = useStudioKeys();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { nameOf } = useProductNames();
  const detail = useQuery({
    queryKey: keys.capture(captureId),
    queryFn: () => api<CaptureDetail>(studioPath(keys.siteKey, `/captures/${captureId}`)),
    enabled: site !== null,
    // While the runner has work, check back; nothing else changes a capture behind your back.
    refetchInterval: (query) =>
      query.state.data?.jobs.some((j) => j.status === 'queued' || j.status === 'running')
        ? 5000
        : false,
  });
  const remove = useMutation({
    mutationFn: () => api(studioPath(keys.siteKey, `/captures/${captureId}`), { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.base });
      void navigate('..', { relative: 'path' });
    },
  });
  if (!site) return <Navigate to="/" replace />;
  if (detail.isPending) return <Loading />;
  if (!detail.data) return <ErrorText error={detail.error} />;
  const { capture, models } = detail.data;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to=".." relative="path" className="hover:underline">
            {t.back}
          </Link>
        }
        title={nameOf(capture.productId)}
        intro={capture.dimensionsMm ? format(t.sizeOf, capture.dimensionsMm) : t.noSize}
        actions={
          can('studio.capture') && (
            <Button
              variant="danger"
              busy={remove.isPending}
              onClick={later(async () => {
                if (await confirmAction(t.deleteCaptureConfirm)) remove.mutate();
              })}
            >
              <Trash2 aria-hidden />
              {t.deleteCapture}
            </Button>
          )
        }
      />
      <ErrorText error={remove.error} />
      <div className="grid gap-6">
        {/* Kept while a model is on its product page, so publishing's own message stays. */}
        {models.some((model) => model.website !== 'none') && <PublishBar />}
        <Uploads detail={detail.data} />
        {can('studio.capture') && <StartJob detail={detail.data} />}
        <Jobs detail={detail.data} />
        {models.length > 0 && (
          <section aria-labelledby="studio-models" className="grid gap-6">
            <h2 id="studio-models" className="text-lg font-semibold">
              {t.models}
            </h2>
            {models.map((model) => {
              // A model shows the one finish its job named (D-058).
              const finishIds = detail.data.jobs.find((j) => j.id === model.jobId)?.finishIds;
              const finishId = finishIds?.length === 1 ? (finishIds[0] ?? null) : null;
              return (
                <ModelCard key={model.id} model={model} capture={capture} finishId={finishId} />
              );
            })}
          </section>
        )}
      </div>
    </>
  );
}

/** A button that opens a file picker, like the media library's upload button. */
function FileButton({
  label,
  accept,
  busy,
  onFile,
}: {
  label: string;
  accept: string;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="secondary" busy={busy} onClick={() => input.current?.click()}>
        <Upload aria-hidden />
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </>
  );
}

function Uploads({ detail }: { detail: CaptureDetail }) {
  const { can } = useCurrentSite();
  const { m, format, locale } = useI18n();
  const t = m.studio;
  const keys = useStudioKeys();
  const queryClient = useQueryClient();
  const [view, setView] = useState<CaptureView>('front');
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const captureId = detail.capture.id;
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.capture(captureId) });
  const upload = async (body: FormData, name: string) => {
    setStatus(format(t.uploading, { name }));
    try {
      await api(studioPath(keys.siteKey, `/captures/${captureId}/files`), {
        method: 'POST',
        body,
      });
      await refresh();
    } finally {
      setStatus(null);
    }
  };
  const uploadModel = async (file: File) => {
    setProblem(null);
    setError(null);
    const modelFormat = modelFormatOf(file);
    if (!modelFormat) {
      setProblem(t.wrongModelFormat);
      return;
    }
    try {
      await upload(captureForm({ kind: 'model', format: modelFormat }, file, file.name), file.name);
    } catch (caught) {
      setError(caught);
    }
  };
  const uploadPhoto = async (file: File) => {
    setProblem(null);
    setError(null);
    try {
      const photo = await encodeCapturePhoto(file);
      await upload(captureForm({ kind: 'photo', view }, photo, 'photo.webp'), file.name);
    } catch (caught) {
      if (caught instanceof ImageError) {
        setProblem(format(t.photoError[caught.code] ?? caught.code, { name: file.name }));
      } else setError(caught);
    }
  };
  const remove = useMutation({
    mutationFn: (fileId: string) =>
      api(studioPath(keys.siteKey, `/captures/${captureId}/files/${fileId}`), {
        method: 'DELETE',
      }),
    onSuccess: refresh,
  });
  const photoViews = new Set(
    detail.files.filter((f) => f.kind === 'photo' && f.view).map((f) => f.view),
  );
  const missing = QUICK_CAPTURE_VIEWS.filter((v) => !photoViews.has(v));
  return (
    <Card title={t.uploads} icon={<Upload />}>
      <div className="grid gap-6">
        {can('studio.capture') && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid content-start gap-2">
              <h3 className="text-sm font-semibold">{t.model}</h3>
              <p className="text-xs text-muted">{t.modelHelp}</p>
              <div>
                <FileButton
                  label={t.uploadModel}
                  accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                  busy={status !== null}
                  onFile={(file) => void uploadModel(file)}
                />
              </div>
            </div>
            <div className="grid content-start gap-2">
              <h3 className="text-sm font-semibold">{t.photos}</h3>
              <p className="text-xs text-muted">{t.photosHelp}</p>
              <div className="flex flex-wrap items-end gap-3">
                <Field label={t.view}>
                  {(props) => (
                    <Select
                      {...props}
                      value={view}
                      onChange={(e) => setView(e.target.value as CaptureView)}
                    >
                      {CAPTURE_VIEWS.map((v) => (
                        <option key={v} value={v}>
                          {t.views[v]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <FileButton
                  label={t.uploadPhoto}
                  accept="image/*"
                  busy={status !== null}
                  onFile={(file) => void uploadPhoto(file)}
                />
              </div>
            </div>
          </div>
        )}
        {status && <Alert tone="accent">{status}</Alert>}
        {problem && <Alert tone="danger">{problem}</Alert>}
        <ErrorText error={error ?? remove.error} />
        <p className="text-sm text-muted">
          {missing.length > 0
            ? format(t.missingViews, {
                views: new Intl.ListFormat(locale).format(missing.map((v) => t.views[v] ?? v)),
              })
            : t.allViews}
        </p>
        {detail.files.length === 0 ? (
          <p className="text-sm text-muted">{t.noUploads}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t.uploads}>
            {detail.files.map((file) => {
              const name =
                file.kind === 'photo' && file.view
                  ? `${t.kinds[file.kind] ?? ''} · ${t.views[file.view] ?? file.view}`
                  : `${t.kinds[file.kind] ?? ''} · ${file.format.toUpperCase()}`;
              const url = fileUrl(keys.siteKey, captureId, file.id);
              return (
                <li key={file.id} className="grid gap-2 rounded-xl border border-border p-3">
                  {file.kind === 'photo' ? (
                    <img
                      src={url}
                      alt={name}
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-lg bg-bg object-contain"
                    />
                  ) : (
                    <div className="grid aspect-[4/3] place-items-center rounded-lg bg-bg text-muted">
                      <Box className="size-8" aria-hidden />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{name}</p>
                      <p className="text-muted">
                        {formatBytes(file.bytes, locale)}
                        {file.widthPx && file.heightPx
                          ? ` · ${format(t.pixels, { width: file.widthPx, height: file.heightPx })}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {file.kind !== 'photo' && (
                        <a
                          href={url}
                          download
                          aria-label={`${t.download}: ${name}`}
                          className="grid size-9 place-items-center rounded-lg hover:bg-surface-2"
                        >
                          <Download className="size-4" aria-hidden />
                        </a>
                      )}
                      {can('studio.capture') && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={format(t.deleteFile, { name })}
                          onClick={() => remove.mutate(file.id)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function StartJob({ detail }: { detail: CaptureDetail }) {
  const { m } = useI18n();
  const t = m.studio;
  const keys = useStudioKeys();
  const queryClient = useQueryClient();
  const bilingual = useBilingual();
  const { catalogue } = useProductNames();
  const product = useProduct(detail.capture.productId);
  const possible = IMPORT_METHODS.filter(
    (method) => detail.eligibility.find((e) => e.method === method)?.possible,
  );
  const [method, setMethod] = useState<Method>('artist');
  const finishNames = new Map(
    (catalogue.data?.structure.finishes ?? []).map((f) => [f.id, bilingual(f.name)] as const),
  );
  const productFinishes = [
    ...new Set(
      (product.data?.product.variants ?? [])
        .map((v) => v.finishId)
        .filter((id): id is string => typeof id === 'string' && finishNames.has(id)),
    ),
  ];
  // Each finish is its own model (D-058): the job names the one the uploaded model shows.
  const [chosen, setChosen] = useState<string | null>(null);
  const finishId =
    chosen && productFinishes.includes(chosen) ? chosen : (productFinishes[0] ?? null);
  const hasModel = detail.files.some((f) => f.kind === 'model');
  const start = useMutation({
    mutationFn: () =>
      api(studioPath(keys.siteKey, `/captures/${detail.capture.id}/jobs`), {
        method: 'POST',
        body: {
          providerId: 'model-import',
          method: possible.includes(method) ? method : possible[0],
          finishIds: finishId ? [finishId] : [],
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.capture(detail.capture.id) }),
  });
  return (
    <Card title={t.makeModel} description={t.makeModelIntro} icon={<Box />}>
      {!hasModel ? (
        <p className="text-sm text-muted">{t.needModel}</p>
      ) : (
        <div className="grid gap-4">
          <Field label={t.method}>
            {(props) => (
              <Select
                {...props}
                value={possible.includes(method) ? method : (possible[0] ?? '')}
                onChange={(e) => setMethod(e.target.value as Method)}
              >
                {possible.map((p) => (
                  <option key={p} value={p}>
                    {t.methods[p]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t.finishes}</legend>
            {productFinishes.length === 0 ? (
              <p className="text-sm text-muted">{t.noFinishes}</p>
            ) : (
              <>
                {productFinishes.map((id) => (
                  <label key={id} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`finish-${detail.capture.id}`}
                      className="size-4 accent-accent"
                      checked={finishId === id}
                      onChange={() => setChosen(id)}
                    />
                    {finishNames.get(id)}
                  </label>
                ))}
                <p className="text-xs text-muted">{t.finishesHelp}</p>
              </>
            )}
          </fieldset>
          <ErrorText error={start.error} />
          <div>
            <Button busy={start.isPending} onClick={() => start.mutate()}>
              {t.start}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Jobs({ detail }: { detail: CaptureDetail }) {
  const { can } = useCurrentSite();
  const { m, date } = useI18n();
  const t = m.studio;
  const keys = useStudioKeys();
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: (id: string) => api(studioPath(keys.siteKey, `/jobs/${id}`), { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.capture(detail.capture.id) }),
  });
  const tone = (status: string) =>
    status === 'done'
      ? 'success'
      : status === 'failed'
        ? 'danger'
        : status === 'running'
          ? 'accent'
          : 'neutral';
  return (
    <Card title={t.jobs} description={t.runnerNote}>
      <ErrorText error={cancel.error} />
      {detail.jobs.length === 0 ? (
        <p className="text-sm text-muted">{t.noJobs}</p>
      ) : (
        <ul className="grid gap-2" aria-label={t.jobs}>
          {detail.jobs.map((job) => (
            <li
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{t.methods[job.method]}</p>
                <p className="text-muted">{date(job.createdAt, true)}</p>
                {job.status === 'failed' && job.detail && (
                  <p className="mt-1 text-danger" dir="auto">
                    {job.detail}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={tone(job.status)} dot>
                  {t.status[job.status]}
                </Badge>
                {job.status === 'queued' && can('studio.capture') && (
                  <Button size="sm" variant="ghost" onClick={() => cancel.mutate(job.id)}>
                    {t.cancelJob}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------ Model ------------------------------------------------ */

function useIssueText() {
  const { m, format, locale } = useI18n();
  const t = m.studio;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  return (issue: TechnicalIssue) => {
    switch (issue.check) {
      case 'validator':
        return format(t.issues.validator, {
          count: number(issue.errors),
          version: t.versionInSentence[issue.version] ?? issue.version,
        });
      case 'budget': {
        const value = (n: number) =>
          issue.budget.check === 'bytes'
            ? formatBytes(n, locale)
            : issue.budget.check === 'texture-size'
              ? format(t.pixels, { width: number(n), height: number(n) })
              : number(n);
        return format(t.issues.budget, {
          version: t.versionInSentence[issue.version] ?? issue.version,
          check: t.budgetChecks[issue.budget.check] ?? issue.budget.check,
          measured: value(issue.budget.measured),
          limit: value(issue.budget.limit),
        });
      }
      case 'scale':
        return issue.reason === 'mismatch' ? t.issues.scaleMismatch : t.issues.scaleNoDimensions;
      case 'materials':
        return format(t.issues.materials, { count: number(issue.missing) });
      case 'unreadable':
        return t.issues.unreadable;
    }
  };
}

function ModelCard({
  model,
  capture,
  finishId,
}: {
  model: StudioModel;
  capture: StudioCapture;
  finishId: string | null;
}) {
  const { can } = useCurrentSite();
  const { m, date, format, locale } = useI18n();
  const t = m.studio;
  const keys = useStudioKeys();
  const queryClient = useQueryClient();
  const issueText = useIssueText();
  const bilingual = useBilingual();
  const { catalogue } = useProductNames();
  const finish = catalogue.data?.structure.finishes.find((f) => f.id === finishId);
  const finishName = finish ? bilingual(finish.name) : '';
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const reviews = useQuery({
    queryKey: [...keys.capture(capture.id), 'model', model.id],
    queryFn: () =>
      api<{ model: StudioModel; reviews: StudioReview[] }>(
        studioPath(keys.siteKey, `/models/${model.id}`),
      ),
  });
  const approve = useMutation({
    mutationFn: () =>
      api(studioPath(keys.siteKey, `/models/${model.id}/approve`), { method: 'POST' }),
    onSuccess: async () => {
      toast(t.approved);
      // The site's pending changes (the publish bar) include the model now.
      await queryClient.invalidateQueries({ queryKey: ['site', keys.siteKey] });
    },
  });
  const takeOff = useMutation({
    mutationFn: () =>
      api(studioPath(keys.siteKey, `/models/${model.id}/website`), { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site', keys.siteKey] }),
  });
  const putBack = useMutation({
    mutationFn: () =>
      api(studioPath(keys.siteKey, `/models/${model.id}/website`), { method: 'PUT' }),
    onSuccess: async () => {
      toast(t.website['assigned'] ?? '');
      await queryClient.invalidateQueries({ queryKey: ['site', keys.siteKey] });
    },
  });
  const issues = model.technicalIssues;
  const sizes = model.measurements;
  const box = sizes.boundingBoxMm;
  const poster = model.files.posterFront
    ? modelFileUrl(keys.siteKey, model.id, 'posterFront')
    : undefined;
  const reviewTone =
    model.reviewStatus === 'ready-for-approval'
      ? 'success'
      : model.reviewStatus === 'pending'
        ? 'neutral'
        : 'warning';
  const messages = [
    ...(model.validatorReport.desktop?.messages ?? []),
    ...(model.validatorReport.mobile?.messages ?? []),
  ];
  return (
    <Card
      title={t.labels[model.label] ?? model.label}
      description={[
        format(t.madeOn, { date: date(model.createdAt, true) }),
        finishName ? format(t.finishOf, { name: finishName }) : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      icon={<Images />}
      actions={
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={reviewTone} dot>
            {t.reviewStatus[model.reviewStatus]}
          </Badge>
          {model.approvedAt && <Badge tone="success">{t.approved}</Badge>}
          {model.website !== 'none' && (
            <Badge
              tone={
                model.website === 'live'
                  ? 'success'
                  : model.website === 'unshown'
                    ? 'warning'
                    : 'accent'
              }
            >
              {t.website[model.website]}
            </Badge>
          )}
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {model.files.desktop ? (
            <Suspense fallback={<Loading />}>
              <ModelViewer
                src={modelFileUrl(keys.siteKey, model.id, 'desktop')}
                poster={poster}
                alt={t.preview}
              />
            </Suspense>
          ) : null}
          <div className="grid grid-cols-2 gap-3 content-start">
            {(['posterFront', 'posterThreeQuarter'] as const)
              .filter((file) => model.files[file])
              .map((file) => (
                <img
                  key={file}
                  src={modelFileUrl(keys.siteKey, model.id, file)}
                  alt={t[file]}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg bg-bg object-contain"
                />
              ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby={`checks-${model.id}`}>
            <h3 id={`checks-${model.id}`} className="mb-2 text-sm font-semibold">
              {t.checks}
            </h3>
            {issues.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden />
                {t.checksPass}
              </p>
            ) : (
              <ul className="grid list-disc gap-1 ps-5 text-sm text-danger">
                {issues.map((issue, index) => (
                  <li key={index}>{issueText(issue)}</li>
                ))}
              </ul>
            )}
            {messages.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted">
                  {format(t.validatorMessages, { count: number(messages.length) })}
                </summary>
                <ul className="mt-2 grid gap-1 text-xs" dir="ltr">
                  {messages.map((message, index) => (
                    <li key={index} className="break-words">
                      {message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <section aria-labelledby={`sizes-${model.id}`}>
            <h3 id={`sizes-${model.id}`} className="mb-2 text-sm font-semibold">
              {t.measurements}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-muted">
                  <th className="pb-1 text-start font-normal">{t.version}</th>
                  <th className="pb-1 text-start font-normal">{t.triangles}</th>
                  <th className="pb-1 text-start font-normal">{t.fileSize}</th>
                  <th className="pb-1 text-start font-normal">{t.textures}</th>
                </tr>
              </thead>
              <tbody>
                {(['desktop', 'mobile'] as const).map((version) => {
                  const v = sizes[version];
                  return (
                    <tr key={version}>
                      <th className="py-0.5 text-start font-medium">{t[version]}</th>
                      <td>{v ? number(v.triangles) : '—'}</td>
                      <td>{v ? formatBytes(v.bytes, locale) : '—'}</td>
                      <td>{v && v.maxTextureSize > 0 ? number(v.maxTextureSize) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">{t.measuredSize}</dt>
              <dd>
                {box
                  ? format(t.sizeOf, {
                      width: number(Math.round(box.width)),
                      height: number(Math.round(box.height)),
                      depth: number(Math.round(box.depth)),
                    })
                  : '—'}
              </dd>
              <dt className="text-muted">{t.enteredSize}</dt>
              <dd>
                {capture.dimensionsMm
                  ? format(t.sizeOf, {
                      width: number(capture.dimensionsMm.width),
                      height: number(capture.dimensionsMm.height),
                      depth: number(capture.dimensionsMm.depth),
                    })
                  : t.noSize}
              </dd>
            </dl>
          </section>
        </div>

        {can('studio.review') && !model.approvedAt && (
          <ReviewForm model={model} captureId={capture.id} />
        )}

        {(reviews.data?.reviews.length ?? 0) > 0 && (
          <section aria-labelledby={`reviews-${model.id}`}>
            <h3 id={`reviews-${model.id}`} className="mb-2 text-sm font-semibold">
              {t.reviews}
            </h3>
            <ul className="grid gap-2">
              {reviews.data?.reviews.map((review) => (
                <li key={review.id} className="rounded-xl border border-border p-3 text-sm">
                  <p className="font-medium">{t.reviewStatus[review.decision]}</p>
                  <p className="text-muted">{date(review.createdAt, true)}</p>
                  {review.notes && (
                    <p className="mt-1 whitespace-pre-wrap" dir="auto">
                      {review.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {can('studio.approve') &&
          model.reviewStatus === 'ready-for-approval' &&
          issues.length === 0 &&
          !model.approvedAt && (
            <div className="grid gap-2">
              <ErrorText error={approve.error} />
              <div>
                <Button
                  busy={approve.isPending}
                  onClick={later(async () => {
                    if (await confirmAction(t.approveConfirm)) approve.mutate();
                  })}
                >
                  <CheckCircle2 aria-hidden />
                  {t.approve}
                </Button>
              </div>
            </div>
          )}

        {can('studio.approve') &&
          model.approvedAt &&
          model.reviewStatus === 'ready-for-approval' &&
          issues.length === 0 &&
          model.website === 'none' && (
            <div className="grid gap-2">
              <ErrorText error={putBack.error} />
              <div>
                <Button
                  variant="secondary"
                  busy={putBack.isPending}
                  onClick={later(async () => {
                    if (await confirmAction(t.putBackConfirm)) putBack.mutate();
                  })}
                >
                  {t.putBack}
                </Button>
              </div>
            </div>
          )}

        {can('studio.approve') && model.website !== 'none' && (
          <div className="grid gap-2">
            <ErrorText error={takeOff.error} />
            <div>
              <Button
                variant="secondary"
                busy={takeOff.isPending}
                onClick={later(async () => {
                  if (await confirmAction(t.takeOffConfirm)) takeOff.mutate();
                })}
              >
                {t.takeOff}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ReviewForm({ model, captureId }: { model: StudioModel; captureId: string }) {
  const { m } = useI18n();
  const t = m.studio;
  const keys = useStudioKeys();
  const queryClient = useQueryClient();
  const blocked = model.technicalIssues.length > 0;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<ReviewDecision>(
    blocked ? 'needs-manual-correction' : 'ready-for-approval',
  );
  const [notes, setNotes] = useState('');
  const allChecked = REVIEW_CHECKS.every((check) => checked.has(check));
  const save = useMutation({
    mutationFn: () =>
      api(studioPath(keys.siteKey, `/models/${model.id}/review`), {
        method: 'POST',
        body: {
          checklist: Object.fromEntries(REVIEW_CHECKS.map((c) => [c, checked.has(c)])),
          decision,
          notes,
        },
      }),
    onSuccess: async () => {
      toast(t.reviewStatus[decision] ?? decision);
      setNotes('');
      await queryClient.invalidateQueries({ queryKey: keys.capture(captureId) });
    },
  });
  const decisions: ReviewDecision[] = [
    'ready-for-approval',
    'needs-better-photos',
    'needs-manual-correction',
  ];
  return (
    <section
      aria-labelledby={`review-${model.id}`}
      className="grid gap-4 rounded-xl border border-border p-4"
    >
      <div>
        <h3 id={`review-${model.id}`} className="text-sm font-semibold">
          {t.review}
        </h3>
        <p className="mt-0.5 text-sm text-muted">{t.reviewIntro}</p>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">{t.review}</legend>
        {REVIEW_CHECKS.map((check) => (
          <label key={check} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={checked.has(check)}
              onChange={(e) => {
                const next = new Set(checked);
                if (e.target.checked) next.add(check);
                else next.delete(check);
                setChecked(next);
              }}
            />
            {t.reviewChecks[check]}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.decision} help={blocked ? t.readyBlocked : undefined}>
          {(props) => (
            <Select
              {...props}
              value={decision}
              onChange={(e) => setDecision(e.target.value as ReviewDecision)}
            >
              {decisions.map((d) => (
                <option key={d} value={d} disabled={d === 'ready-for-approval' && blocked}>
                  {t.reviewStatus[d]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t.notes}>
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
      </div>
      <ErrorText error={save.error} />
      <div>
        <Button
          busy={save.isPending}
          disabled={decision === 'ready-for-approval' && (blocked || !allChecked)}
          onClick={() => save.mutate()}
        >
          {t.saveReview}
        </Button>
      </div>
    </section>
  );
}
