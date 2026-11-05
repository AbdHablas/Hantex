import type { CatalogueIssue, SiteIssue } from '@hantex/sections';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Rocket } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, sitePath } from '../../lib/api';
import {
  useBuilderKeys,
  useBuilderMutation,
  useChanges,
  usePages,
  type PageSummary,
} from '../../lib/builder';
import { useCatalogue, type CatalogueListing } from '../../lib/catalogue';
import { useBilingual, useI18n } from '../../lib/i18n';
import { useCurrentSite } from '../../lib/session';
import { Alert, Button, Card, Dialog, ErrorText, Field, Input, confirmAction, later } from '../ui';

/** A scheduled publish (D-054), as GET /changes/schedule describes it. */
interface Schedule {
  id: string;
  runAt: string;
  changes: number;
  status: 'scheduled' | 'running' | 'published' | 'cancelled' | 'blocked' | 'failed';
  detail: string;
  by: string;
  finishedAt: string | null;
}

/** A local date and time for <input type="datetime-local">, in the device's time zone. */
const localValue = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Publish changes (D-037): how many builder items of this website differ from what is public,
 * the checks that block publishing, and one button that publishes them all with one rebuild.
 */
export function PublishBar() {
  const { m, format, date } = useI18n();
  const b = m.builder;
  const { site, siteKey, can } = useCurrentSite();
  const changes = useChanges();
  const pages = usePages();
  const catalogue = useCatalogue();
  const [notice, setNotice] = useState<string | null>(null);
  const publish = useBuilderMutation(() =>
    api(sitePath(siteKey, '/changes/publish'), { method: 'POST', body: {} }),
  );
  const keys = useBuilderKeys();
  const schedules = useQuery({
    queryKey: [...keys.base, 'schedule'],
    queryFn: () =>
      api<{ waiting: Schedule | null; recent: Schedule[] }>(sitePath(siteKey, '/changes/schedule')),
    enabled: site !== null,
  });
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState('');
  const schedule = useBuilderMutation((runAt: string) =>
    api(sitePath(siteKey, '/changes/schedule'), { method: 'POST', body: { runAt } }),
  );
  const cancel = useBuilderMutation(() =>
    api(sitePath(siteKey, '/changes/schedule'), { method: 'DELETE' }),
  );
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!site || !changes.data) return null;
  const count = changes.data.items.filter((i) => i.allowed).length;
  const issues = changes.data.issues;
  const catalogueIssues = changes.data.catalogueIssues ?? [];
  const canPublish = can('site.publish') && !site.archived;
  const waiting = schedules.data?.waiting ?? null;
  const last = schedules.data?.recent[0];
  const lastBlocked = !waiting && last && (last.status === 'blocked' || last.status === 'failed');
  const blocked = count === 0 || issues.length > 0 || catalogueIssues.length > 0;
  const submitSchedule = (event: FormEvent) => {
    event.preventDefault();
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return;
    schedule.mutate(date.toISOString(), {
      onSuccess: () => {
        setScheduling(false);
        setNotice(b['scheduleSaved'] ?? '');
      },
    });
  };
  return (
    <Card
      title={b['publishTitle']}
      icon={<Rocket />}
      description={count === 0 ? b['noChanges'] : format(b['changesCount'] ?? '', { count })}
      actions={
        canPublish && (
          <div className="flex flex-wrap gap-2">
            {!waiting && (
              <Button
                variant="secondary"
                disabled={blocked}
                onClick={() => {
                  schedule.reset();
                  setWhen(localValue(new Date(Date.now() + 60 * 60_000)));
                  setScheduling(true);
                }}
              >
                <CalendarClock aria-hidden />
                {b['schedule']}
              </Button>
            )}
            <Button
              disabled={blocked}
              busy={publish.isPending}
              onClick={later(async () => {
                if (!(await confirmAction(b['publishConfirm'] ?? ''))) return;
                setNotice(null);
                publish.mutate(undefined, { onSuccess: () => setNotice(b['published'] ?? '') });
              })}
            >
              {b['publish']}
            </Button>
          </div>
        )
      }
    >
      {waiting && (
        <div className="mb-3">
          <Alert tone="accent">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {waiting.status === 'running'
                  ? b['scheduledRunning']
                  : format(b['scheduled'] ?? '', {
                      count: waiting.changes,
                      date: date(waiting.runAt, true),
                      by: waiting.by || '—',
                    })}
              </span>
              {canPublish && waiting.status === 'scheduled' && (
                <Button
                  size="sm"
                  variant="secondary"
                  busy={cancel.isPending}
                  onClick={later(async () => {
                    if (!(await confirmAction(b['cancelScheduleConfirm'] ?? ''))) return;
                    cancel.mutate(undefined, {
                      onSuccess: () => setNotice(b['scheduleCancelled'] ?? ''),
                    });
                  })}
                >
                  {b['cancelSchedule']}
                </Button>
              )}
            </div>
          </Alert>
        </div>
      )}
      {lastBlocked && last && (
        <div className="mb-3">
          <Alert tone="warning">
            {format(b['scheduleBlocked'] ?? '', {
              date: date(last.runAt, true),
              reason: b[`scheduleReason.${last.detail}`] ?? b['scheduleReason.other'] ?? '',
            })}
          </Alert>
        </div>
      )}
      <ErrorText error={cancel.error} />
      <Dialog
        open={scheduling}
        onClose={() => setScheduling(false)}
        title={b['scheduleTitle']}
        description={b['scheduleHelp']}
      >
        <form className="grid gap-4" onSubmit={submitSchedule}>
          <Field label={b['scheduleAt']} help={format(b['scheduleZone'] ?? '', { zone })}>
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                dir="ltr"
                required
                min={localValue(new Date(Date.now() + 10 * 60_000))}
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            )}
          </Field>
          <ErrorText error={schedule.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setScheduling(false)}>
              {b['scheduleCancelDialog']}
            </Button>
            <Button type="submit" busy={schedule.isPending}>
              {b['scheduleConfirm']}
            </Button>
          </div>
        </form>
      </Dialog>
      {(issues.length > 0 || catalogueIssues.length > 0 || notice || publish.error) && (
        <div className="grid gap-3">
          {notice && <Alert tone="success">{notice}</Alert>}
          <ErrorText error={publish.error} />
          {issues.length > 0 && (
            <Alert tone="warning">
              <p className="font-medium">{b['issuesTitle']}</p>
              <ul className="mt-1 list-disc ps-5">
                {issues.map((issue, i) => (
                  <IssueLine key={i} issue={issue} pages={pages.data?.pages ?? []} />
                ))}
              </ul>
            </Alert>
          )}
          {catalogueIssues.length > 0 && (
            <Alert tone="warning">
              <p className="font-medium">{m.catalogue.issuesTitle}</p>
              <ul className="mt-1 list-disc ps-5">
                {catalogueIssues.map((issue, i) => (
                  <CatalogueIssueLine key={i} issue={issue} listing={catalogue.data} />
                ))}
              </ul>
            </Alert>
          )}
        </div>
      )}
    </Card>
  );
}

function IssueLine({ issue, pages }: { issue: SiteIssue; pages: PageSummary[] }) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const b = m.builder;
  const languages: Record<string, string> = { ar: m.arabic, en: m.english };
  const detail = issue.detail ? (languages[issue.detail] ?? issue.detail) : '';
  const pageTitle = (id: string) => {
    const page = pages.find((p) => p.id === id);
    return page ? bi(page.title) : null;
  };
  const [scope, area] = issue.target.split(':');
  const where =
    scope === 'menu'
      ? area === 'header'
        ? b['headerMenu']
        : b['footerMenu']
      : scope === 'saved'
        ? b['savedBadge']
        : scope === 'layout'
          ? b['header']
          : scope === 'page'
            ? pageTitle(area ?? '')
            : pageTitle(issue.target);
  return (
    <li>
      {format(b[`issue.${issue.code}`] ?? issue.code, { detail })}
      {where && <span className="text-muted"> — {format(b['issueWhere'] ?? '', { where })}</span>}
    </li>
  );
}

function CatalogueIssueLine({
  issue,
  listing,
}: {
  issue: CatalogueIssue;
  listing: CatalogueListing | undefined;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const [scope, id] = issue.target.split(':');
  const structure = listing?.structure;
  const name =
    scope === 'product'
      ? listing?.products.find((p) => p.id === id)?.name
      : scope === 'category'
        ? structure?.categories.find((c) => c.id === id)?.name
        : scope === 'attribute'
          ? structure?.attributes.find((a) => a.id === id)?.name
          : scope === 'finish'
            ? structure?.finishes.find((f) => f.id === id)?.name
            : scope === 'series'
              ? structure?.series.find((x) => x.id === id)?.name
              : structure?.groups.find((g) => g.id === id)?.name;
  const kind = t.issueKind[scope ?? ''] ?? '';
  const where = `${kind}${name ? ` “${bi(name)}”` : ''}`;
  return (
    <li>
      {t.issue[issue.code] ?? issue.code}
      {issue.code === 'duplicate-sku' || issue.code === 'duplicate-address' ? (
        <span dir="ltr"> ({issue.detail})</span>
      ) : null}
      {where && (
        <span className="text-muted"> — {format(m.builder['issueWhere'] ?? '', { where })}</span>
      )}
    </li>
  );
}
