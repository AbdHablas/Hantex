import type { SiteIssue } from '@hantex/sections';
import { Rocket } from 'lucide-react';
import { useState } from 'react';
import { api, sitePath } from '../../lib/api';
import { useBuilderMutation, useChanges, usePages, type PageSummary } from '../../lib/builder';
import { useBilingual, useI18n } from '../../lib/i18n';
import { useCurrentSite } from '../../lib/session';
import { Alert, Button, Card, ErrorText, confirmAction, later } from '../ui';

/**
 * Publish changes (D-037): how many builder items of this website differ from what is public,
 * the checks that block publishing, and one button that publishes them all with one rebuild.
 */
export function PublishBar() {
  const { m, format } = useI18n();
  const b = m.builder;
  const { site, siteKey, can } = useCurrentSite();
  const changes = useChanges();
  const pages = usePages();
  const [notice, setNotice] = useState<string | null>(null);
  const publish = useBuilderMutation(() =>
    api(sitePath(siteKey, '/changes/publish'), { method: 'POST', body: {} }),
  );
  if (!site || !changes.data) return null;
  const count = changes.data.items.filter((i) => i.allowed).length;
  const issues = changes.data.issues;
  const canPublish = can('site.publish') && !site.archived;
  return (
    <Card
      title={b['publishTitle']}
      icon={<Rocket />}
      description={count === 0 ? b['noChanges'] : format(b['changesCount'] ?? '', { count })}
      actions={
        canPublish && (
          <Button
            disabled={count === 0 || issues.length > 0}
            busy={publish.isPending}
            onClick={later(async () => {
              if (!(await confirmAction(b['publishConfirm'] ?? ''))) return;
              setNotice(null);
              publish.mutate(undefined, { onSuccess: () => setNotice(b['published'] ?? '') });
            })}
          >
            {b['publish']}
          </Button>
        )
      }
    >
      {(issues.length > 0 || notice || publish.error) && (
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
