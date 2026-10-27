import type { ImageRef } from '@hantex/sections';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ImageIcon, ImageOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ApiError, api, sitePath } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { thumbnail, type MediaItem, type MediaPage } from '../../lib/media';
import { useCurrentSite } from '../../lib/session';
import { Button, Dialog, EmptyState, ErrorText, Loading } from '../ui';

/**
 * A section's image (D-044): chosen from the website's media library, never uploaded or linked
 * here. Uploading and describing images happen on the Media page.
 */

function Picker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: MediaItem) => void;
}) {
  const { m, locale } = useI18n();
  const t = m.media;
  const { siteKey } = useCurrentSite();
  const list = useInfiniteQuery({
    queryKey: ['site', siteKey, 'media'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<MediaPage>(
        sitePath(siteKey, `/media${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
      ),
    getNextPageParam: (last) => last.next,
    enabled: open,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t['pickerTitle']}
      className="w-[min(52rem,calc(100vw-2rem))]"
    >
      <div className="grid gap-4">
        <ErrorText error={list.error} />
        {list.isPending ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState icon={<ImageIcon />} title={t['empty']} />
        ) : (
          <ul className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="block w-full overflow-hidden rounded-xl border border-border text-start hover:border-accent focus-visible:border-accent"
                >
                  <img
                    src={thumbnail(item)}
                    alt=""
                    loading="lazy"
                    className="aspect-[4/3] w-full bg-surface-2 object-cover"
                  />
                  <span className="block truncate px-3 pt-2 text-sm font-medium">{item.name}</span>
                  <span className="block truncate px-3 pb-2 text-xs text-muted">
                    {item.alt[locale] || t['noAlt']}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {list.hasNextPage ? (
            <Button
              variant="secondary"
              busy={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {m.loadMore}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Link
              to={`/s/${siteKey}/media`}
              target="_blank"
              className="self-center text-sm font-medium text-accent-text underline-offset-4 hover:underline"
            >
              {t['manage']}
            </Link>
            <Button variant="secondary" onClick={onClose}>
              {m.cancel}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function ImageField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: ImageRef;
  onChange: (value: ImageRef) => void;
  disabled: boolean;
}) {
  const { m, locale } = useI18n();
  const t = m.media;
  const { siteKey } = useCurrentSite();
  const [open, setOpen] = useState(false);
  const mediaId = value?.mediaId ?? null;
  const item = useQuery({
    queryKey: ['site', siteKey, 'media', 'item', mediaId],
    queryFn: () => api<MediaItem>(sitePath(siteKey, `/media/${mediaId ?? ''}`)),
    enabled: mediaId !== null,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const missing = item.error instanceof ApiError && item.error.status === 404;
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-2 text-muted">
          {item.data ? (
            <img src={thumbnail(item.data)} alt="" className="size-full object-cover" />
          ) : missing ? (
            <ImageOff className="size-6" aria-hidden />
          ) : (
            <ImageIcon className="size-6" aria-hidden />
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-1 text-sm">
          {mediaId === null ? (
            <span className="text-muted">{t['noImage']}</span>
          ) : missing ? (
            <span className="text-danger">{t['missing']}</span>
          ) : item.data ? (
            <>
              <span className="truncate font-medium">{item.data.name}</span>
              <span className="truncate text-muted">{item.data.alt[locale] || t['noAlt']}</span>
            </>
          ) : null}
          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
                {mediaId === null ? t['choose'] : t['change']}
              </Button>
              {mediaId !== null && (
                <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                  {t['removeImage']}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      <Picker
        open={open}
        onClose={() => setOpen(false)}
        onPick={(picked) => {
          setOpen(false);
          onChange({ mediaId: picked.id });
        }}
      />
    </fieldset>
  );
}
