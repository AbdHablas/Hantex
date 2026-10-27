import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { BilingualField } from '../components/document';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Loading,
  PageHeader,
  cn,
  confirmAction,
  later,
} from '../components/ui';
import { ApiError, api, sitePath } from '../lib/api';
import { useI18n } from '../lib/i18n';
import {
  ImageError,
  formatBytes,
  processImage,
  thumbnail,
  uploadForm,
  type MediaItem,
  type MediaPage,
} from '../lib/media';
import { useCurrentSite } from '../lib/session';

/** The website's media library (D-044): upload, describe and remove images. */

function DetailsDialog({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  const { m, format, locale } = useI18n();
  const t = m.media;
  const { siteKey, can, site } = useCurrentSite();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [alt, setAlt] = useState({ ar: '', en: '' });
  useEffect(() => {
    if (item) {
      setName(item.name);
      setAlt(item.alt);
    }
  }, [item]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['site', siteKey, 'media'] });
  const save = useMutation({
    mutationFn: () =>
      api(sitePath(siteKey, `/media/${item?.id ?? ''}`), {
        method: 'PATCH',
        body: { name: name.trim(), alt },
      }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(sitePath(siteKey, `/media/${item?.id ?? ''}`), { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  // A fresh dialog for each image: no message left over from the last one.
  const { reset: resetSave } = save;
  const { reset: resetRemove } = remove;
  useEffect(() => {
    resetSave();
    resetRemove();
  }, [item, resetSave, resetRemove]);
  const editable = can('media.edit') && site?.archived !== true;
  // Deleting is refused while pages or the catalogue use the image; say which ones.
  const inUseError =
    remove.error instanceof ApiError && remove.error.code === 'media-in-use'
      ? (remove.error.details as {
          pages?: { title: { ar: string; en: string } }[];
          saved?: { name: { ar: string; en: string } }[];
          catalogue?: { name: { ar: string; en: string } }[];
        })
      : null;
  const inUse = inUseError
    ? [
        ...(inUseError.pages ?? []).map((p) => p.title[locale] || p.title.ar || p.title.en),
        ...(inUseError.saved ?? []).map((s) => s.name[locale] || s.name.ar || s.name.en),
        ...(inUseError.catalogue ?? []).map((x) => x.name[locale] || x.name.ar || x.name.en),
      ].join(locale === 'ar' ? '، ' : ', ')
    : null;
  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={t['details']}
      className="w-[min(46rem,calc(100vw-2rem))]"
    >
      {item && (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <img
            src={thumbnail(item, 960)}
            alt={alt[locale] || item.name}
            className="max-h-80 w-full rounded-xl bg-surface-2 object-contain"
          />
          <p className="text-sm text-muted">
            {format(t['size'] ?? '', {
              width: item.width,
              height: item.height,
              bytes: formatBytes(item.bytes, locale),
            })}
            {item.published && (
              <span className="ms-2">
                <Badge tone="success">{t['published']}</Badge>
              </span>
            )}
          </p>
          <BilingualField
            label={t['alt'] ?? ''}
            help={t['altHelp']}
            value={alt}
            max={250}
            disabled={!editable}
            onChange={setAlt}
          />
          <Field label={t['name']} help={t['nameHelp']}>
            {(props) => (
              <Input
                {...props}
                dir="auto"
                maxLength={120}
                required
                disabled={!editable}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          {inUse ? (
            <Alert tone="danger">{format(t['inUse'] ?? '', { places: inUse })}</Alert>
          ) : (
            <ErrorText error={save.error ?? remove.error} />
          )}
          <div className="flex flex-wrap justify-between gap-2">
            {can('media.delete') && site?.archived !== true ? (
              <Button
                variant="danger"
                busy={remove.isPending}
                onClick={later(async () => {
                  if (await confirmAction(format(t['deleteConfirm'] ?? '', { name: item.name }))) {
                    remove.mutate();
                  }
                })}
              >
                <Trash2 aria-hidden />
                {t['deleteImage']}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                {m.cancel}
              </Button>
              {editable && (
                <Button type="submit" busy={save.isPending} disabled={name.trim() === ''}>
                  {m.save}
                </Button>
              )}
            </div>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function MediaLibrary() {
  const { m, format, locale } = useI18n();
  const t = m.media;
  const { site, siteKey, can } = useCurrentSite();
  const queryClient = useQueryClient();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const editable = can('media.edit') && site?.archived !== true;

  const list = useInfiniteQuery({
    queryKey: ['site', siteKey, 'media'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<MediaPage>(
        sitePath(siteKey, `/media${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
      ),
    getNextPageParam: (last) => last.next,
    enabled: site !== null,
  });

  /** Prepares and uploads the chosen files one by one, so progress is clear. */
  const uploadFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setBusy(true);
    setNotice(null);
    setErrors([]);
    let done = 0;
    const failures: unknown[] = [];
    for (const file of images) {
      try {
        setStatus(format(t['processing'] ?? '', { name: file.name }));
        const processed = await processImage(file);
        setStatus(format(t['uploading'] ?? '', { name: file.name }));
        await api(sitePath(siteKey, '/media'), { method: 'POST', body: uploadForm(processed) });
        done++;
      } catch (error) {
        failures.push(
          error instanceof ImageError
            ? new Error(format(t[`error.${error.code}`] ?? error.code, { name: file.name }))
            : error,
        );
      }
    }
    setStatus(null);
    setBusy(false);
    setErrors(failures);
    if (done > 0) setNotice(format(t['uploaded'] ?? '', { count: done }));
    await queryClient.invalidateQueries({ queryKey: ['site', siteKey, 'media'] });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (editable && !busy) void uploadFiles([...event.dataTransfer.files]);
  };

  const pages = list.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const usage = pages[0];

  return (
    <>
      <PageHeader
        title={t['title']}
        intro={t['intro']}
        actions={
          editable && (
            <Button busy={busy} onClick={() => input.current?.click()}>
              <Upload aria-hidden />
              {t['upload']}
            </Button>
          )
        }
      />
      <input
        id={inputId}
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        tabIndex={-1}
        aria-label={t['upload']}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void uploadFiles(files);
        }}
      />
      <div className="grid gap-5">
        {status && (
          <Alert>
            <span role="status">{status}</span>
          </Alert>
        )}
        {notice && <Alert tone="success">{notice}</Alert>}
        {errors.map((error, i) => (
          <ErrorText key={i} error={error} />
        ))}
        {editable && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-border px-6 py-8 text-center',
              dragging && 'border-accent bg-accent-soft/40',
            )}
          >
            <Upload className="size-6 text-muted" aria-hidden />
            <label htmlFor={inputId} className="cursor-pointer font-medium hover:underline">
              {t['dropHere']}
            </label>
            <p className="text-xs text-muted">{t['formats']}</p>
          </div>
        )}
        <Card
          description={
            usage
              ? format(t['used'] ?? '', {
                  used: formatBytes(usage.usedBytes, locale),
                  quota: formatBytes(usage.quotaBytes, locale),
                })
              : undefined
          }
          title={t['title']}
        >
          <ErrorText error={list.error} />
          {list.isPending ? (
            <Loading />
          ) : items.length === 0 ? (
            <EmptyState icon={<ImageIcon />} title={t['empty']} />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(item)}
                    className="group block w-full overflow-hidden rounded-xl border border-border text-start hover:border-accent focus-visible:border-accent"
                  >
                    <img
                      src={thumbnail(item)}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full bg-surface-2 object-cover"
                    />
                    <span className="block truncate px-3 pt-2 text-sm font-medium">
                      {item.name}
                    </span>
                    <span className="block truncate px-3 pb-2 text-xs text-muted">
                      {item.alt[locale] || t['noAlt']}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list.hasNextPage && (
            <Button
              variant="secondary"
              className="mt-4"
              busy={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {m.loadMore}
            </Button>
          )}
        </Card>
      </div>
      <DetailsDialog item={open} onClose={() => setOpen(null)} />
    </>
  );
}
