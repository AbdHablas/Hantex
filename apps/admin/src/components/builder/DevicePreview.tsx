import { Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ApiError, api, sitePath } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useCurrentSite } from '../../lib/session';
import { Alert, ErrorText, IconButton, cn } from '../ui';

/**
 * The page editor's live preview: the website's own Worker renders the saved draft of one page
 * (a signed form posted into a frame, apps/web/src/pages/preview.astro), shown at a phone,
 * tablet or desktop width and scaled to fit. The site allows only the dashboard to frame it.
 */

const DEVICES = [
  { id: 'phone', width: 390, icon: Smartphone },
  { id: 'tabletDevice', width: 768, icon: Tablet },
  { id: 'desktopDevice', width: 1280, icon: Monitor },
] as const;

export function DevicePreview({
  pageId,
  title,
  revision,
}: {
  pageId: string;
  title: string;
  /** Changes whenever the draft is saved, to reload the preview. */
  revision: string | null;
}) {
  const { m, format, locale: uiLocale } = useI18n();
  const b = m.builder;
  const { siteKey } = useCurrentSite();
  const frameName = `preview-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [locale, setLocale] = useState<'ar' | 'en'>(uiLocale);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { action, fields } = await api<{
        action: string;
        fields: Record<string, string | number>;
      }>(sitePath(siteKey, '/preview'), {
        method: 'POST',
        body: {
          drafts: { 'coming-soon': false, 'site-settings': false, theme: false, builder: true },
          page: pageId,
          locale,
        },
      });
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = action;
      form.target = frameName;
      form.hidden = true;
      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value);
        form.append(input);
      }
      document.body.append(form);
      form.submit();
      form.remove();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [siteKey, pageId, locale, frameName]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const scale = boxWidth > 0 ? Math.min(1, boxWidth / device.width) : 1;
  const height = 720;
  const noDomain = error instanceof ApiError && error.code === 'site-has-no-domain';

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="radiogroup"
          aria-label={b['device']}
          className="inline-flex rounded-xl border border-border bg-surface-2 p-1"
        >
          {DEVICES.map((d) => {
            const Icon = d.icon;
            const active = d.id === device.id;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDevice(d)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted',
                  active && 'bg-surface text-text shadow-sm',
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span>{b[d.id]}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <div
            role="radiogroup"
            aria-label={b['previewLanguage']}
            className="inline-flex rounded-xl border border-border bg-surface-2 p-1"
          >
            {(['ar', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={locale === l}
                lang={l}
                onClick={() => setLocale(l)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted',
                  locale === l && 'bg-surface text-text shadow-sm',
                )}
              >
                {l === 'ar' ? 'ع' : 'EN'}
              </button>
            ))}
          </div>
          <IconButton label={b['refresh'] ?? ''} onClick={() => void load()} disabled={busy}>
            <RefreshCw className={cn('size-4', busy && 'animate-spin')} aria-hidden />
          </IconButton>
        </div>
      </div>
      {noDomain ? (
        <Alert>{b['previewNeedsDomain']}</Alert>
      ) : (
        <>
          <ErrorText error={error} />
          <div
            ref={box}
            className="relative overflow-hidden rounded-xl border border-border bg-surface-2"
            style={{ height: height * scale }}
          >
            <iframe
              name={frameName}
              title={format(b['previewFrame'] ?? '', { title, device: b[device.id] ?? '' })}
              sandbox="allow-scripts allow-same-origin"
              className="absolute start-0 top-0 origin-top-left border-0 bg-white rtl:origin-top-right"
              style={{ width: device.width, height, transform: `scale(${scale})` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
