import { CATEGORY_ICONS, comingSoonSchema, type ComingSoonContent } from '@hantex/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Download, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  ErrorText,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
  Table,
  confirmAction,
} from '../components/ui';
import {
  BilingualField,
  DocumentActions,
  DocumentStatus,
  VersionHistory,
  useDocumentEditor,
} from '../components/document';
import { api, sitePath } from '../lib/api';
import { useBilingual, useI18n } from '../lib/i18n';
import { useCurrentSite } from '../lib/session';

/** Guards every site page: a site the person can't open is "not found", like on the server. */
export function SitePage({ children }: { children: ReactNode }) {
  const { site } = useCurrentSite();
  const { m } = useI18n();
  if (!site) return <Alert tone="warning">{m.errors['not-found']}</Alert>;
  return <>{children}</>;
}

interface Overview {
  site: { key: string; mode: string; archived: boolean };
  subscribers: { total: number; last7Days: number };
  documents: Record<
    string,
    { draftUpdatedAt: string | null; published: { version: number; publishedAt: string } | null }
  >;
  jobs: { id: string; status: string; requestedAt: string }[];
}

export function SiteOverview() {
  const { site, siteKey } = useCurrentSite();
  const { m, format, date } = useI18n();
  const bi = useBilingual();
  const query = useQuery({
    queryKey: ['site', siteKey, 'overview'],
    queryFn: () => api<Overview>(sitePath(siteKey, '/overview')),
    enabled: site !== null,
  });
  if (!site) return <Navigate to="/" replace />;
  return (
    <>
      <PageHeader title={bi(site.name)} intro={m.overview.title} />
      {query.isPending && <Loading />}
      <ErrorText error={query.error} />
      {query.data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {query.data.site.archived && (
            <div className="lg:col-span-2">
              <Alert tone="warning">{m.overview.archived}</Alert>
            </div>
          )}
          <Card title={m.overview.signups}>
            <p className="text-4xl font-semibold">{query.data.subscribers.total}</p>
            <p className="text-muted">
              +{query.data.subscribers.last7Days} {m.overview.last7Days}
            </p>
          </Card>
          <Card title={m.overview.documents}>
            <ul className="flex flex-col gap-3">
              {Object.entries(query.data.documents).map(([kind, doc]) => (
                <li key={kind}>
                  <p className="font-medium">{m.docs[kind] ?? kind}</p>
                  <p className="text-sm text-muted">
                    {doc.published
                      ? format(m.overview.published, {
                          version: doc.published.version,
                          date: date(doc.published.publishedAt, true),
                        })
                      : m.overview.notPublished}
                    {' · '}
                    {doc.draftUpdatedAt
                      ? format(m.overview.draftSaved, { date: date(doc.draftUpdatedAt, true) })
                      : m.overview.noDraft}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={m.overview.jobs} className="lg:col-span-2">
            {query.data.jobs.length === 0 ? (
              <p className="text-muted">{m.overview.noJobs}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {query.data.jobs.map((job) => (
                  <li key={job.id} className="flex items-center gap-3 text-sm">
                    <Badge
                      tone={
                        job.status === 'succeeded'
                          ? 'success'
                          : job.status === 'failed'
                            ? 'danger'
                            : 'accent'
                      }
                    >
                      {m.job[job.status] ?? job.status}
                    </Badge>
                    {date(job.requestedAt, true)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

/* --------------------------------- Coming Soon editor --------------------------------- */

/** "2026-11-01T10:00" (local time in the input) ⇄ ISO 8601 with offset (stored). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

export function ComingSoonEditor() {
  const { m } = useI18n();
  const editor = useDocumentEditor<ComingSoonContent>({
    kind: 'coming-soon',
    schema: comingSoonSchema,
    edit: ['comingSoon.edit'],
    publish: ['site.publish'],
  });
  const { draft, editable } = editor;

  if (!editor.site) return <Navigate to="/" replace />;
  if (editor.query.isPending || !draft) return <Loading />;

  const update = (patch: Partial<ComingSoonContent>) => editor.update({ ...draft, ...patch });
  type List = 'milestones' | 'readiness' | 'highlights' | 'categories' | 'faq';
  const updateItem = <K extends List>(
    list: K,
    index: number,
    patch: Partial<ComingSoonContent[K][number]>,
  ) =>
    update({
      [list]: draft[list].map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  const removeItem = (list: List, index: number) =>
    update({ [list]: draft[list].filter((_, i) => i !== index) });
  const moveItem = (list: List, index: number, by: -1 | 1) => {
    const items = [...draft[list]];
    const [item] = items.splice(index, 1);
    if (!item) return;
    items.splice(index + by, 0, item);
    update({ [list]: items });
  };
  /** Up, down and remove buttons for one row of a list. */
  const rowTools = (list: List, i: number, className = 'ms-auto') =>
    editable && (
      <div className={`flex gap-1 ${className}`}>
        <Button
          size="sm"
          variant="ghost"
          disabled={i === 0}
          onClick={() => moveItem(list, i, -1)}
          aria-label={m.comingSoon.moveUp}
        >
          <ArrowUp className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={i === draft[list].length - 1}
          onClick={() => moveItem(list, i, 1)}
          aria-label={m.comingSoon.moveDown}
        >
          <ArrowDown className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => removeItem(list, i)}
          aria-label={m.comingSoon.remove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    );

  return (
    <>
      <PageHeader
        title={m.comingSoon.title}
        intro={m.comingSoon.intro}
        actions={<DocumentActions editor={editor} />}
      />
      <div className="flex flex-col gap-4">
        <DocumentStatus editor={editor} />

        <Card>
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={m.comingSoon.launchAt} help={m.comingSoon.launchAtHelp}>
                {(props) => (
                  <Input
                    {...props}
                    type="datetime-local"
                    disabled={!editable}
                    value={toLocalInput(draft.launchAt)}
                    onChange={(e) => update({ launchAt: fromLocalInput(e.target.value) })}
                  />
                )}
              </Field>
              <div className="flex flex-col justify-center gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    disabled={!editable}
                    checked={draft.showCountdown}
                    onChange={(e) => update({ showCountdown: e.target.checked })}
                  />
                  {m.comingSoon.showCountdown}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    disabled={!editable}
                    checked={draft.signup.enabled}
                    onChange={(e) => update({ signup: { enabled: e.target.checked } })}
                  />
                  {m.comingSoon.signupEnabled}
                </label>
              </div>
            </div>
            <BilingualField
              label={m.comingSoon.headline}
              max={120}
              disabled={!editable}
              value={draft.headline}
              onChange={(headline) => update({ headline })}
            />
            <BilingualField
              label={m.comingSoon.tagline}
              max={200}
              disabled={!editable}
              value={draft.tagline}
              onChange={(tagline) => update({ tagline })}
            />
            <BilingualField
              label={m.comingSoon.intro_}
              max={600}
              multiline
              disabled={!editable}
              value={draft.intro}
              onChange={(intro) => update({ intro })}
            />
          </div>
        </Card>

        <Card
          title={m.comingSoon.milestones}
          actions={
            editable && draft.milestones.length < 12 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  update({
                    milestones: [
                      ...draft.milestones,
                      {
                        date: new Date().toISOString().slice(0, 10),
                        title: { ar: '', en: '' },
                        done: false,
                      },
                    ],
                  })
                }
              >
                <Plus className="size-4" aria-hidden />
                {m.comingSoon.addMilestone}
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-5">
            {draft.milestones.map((item, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 border-t border-border pt-4 first:border-0 first:pt-0"
              >
                <div className="flex flex-wrap items-end gap-4">
                  <Field label={m.comingSoon.milestoneDate}>
                    {(props) => (
                      <Input
                        {...props}
                        type="date"
                        disabled={!editable}
                        value={item.date}
                        onChange={(e) => updateItem('milestones', i, { date: e.target.value })}
                      />
                    )}
                  </Field>
                  <label className="flex h-10 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-accent"
                      disabled={!editable}
                      checked={item.done}
                      onChange={(e) => updateItem('milestones', i, { done: e.target.checked })}
                    />
                    {m.comingSoon.milestoneDone}
                  </label>
                  {editable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ms-auto"
                      onClick={() => removeItem('milestones', i)}
                      aria-label={m.comingSoon.remove}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
                <BilingualField
                  label={m.comingSoon.milestoneTitle}
                  max={80}
                  disabled={!editable}
                  value={item.title}
                  onChange={(title) => updateItem('milestones', i, { title })}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card
          title={m.comingSoon.highlights}
          actions={
            editable && draft.highlights.length < 6 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  update({
                    highlights: [
                      ...draft.highlights,
                      { title: { ar: '', en: '' }, text: { ar: '', en: '' } },
                    ],
                  })
                }
              >
                <Plus className="size-4" aria-hidden />
                {m.comingSoon.addHighlight}
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-5">
            {draft.highlights.map((item, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 border-t border-border pt-4 first:border-0 first:pt-0"
              >
                {editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="self-end"
                    onClick={() => removeItem('highlights', i)}
                    aria-label={m.comingSoon.remove}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
                <BilingualField
                  label={m.comingSoon.highlightTitle}
                  max={60}
                  disabled={!editable}
                  value={item.title}
                  onChange={(title) => updateItem('highlights', i, { title })}
                />
                <BilingualField
                  label={m.comingSoon.highlightText}
                  max={200}
                  multiline
                  disabled={!editable}
                  value={item.text}
                  onChange={(text) => updateItem('highlights', i, { text })}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card
          title={m.comingSoon.categories}
          actions={
            editable && draft.categories.length < 8 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  update({
                    categories: [
                      ...draft.categories,
                      { icon: 'other', title: { ar: '', en: '' }, text: { ar: '', en: '' } },
                    ],
                  })
                }
              >
                <Plus className="size-4" aria-hidden />
                {m.comingSoon.addCategory}
              </Button>
            ) : undefined
          }
        >
          <p className="mb-4 text-sm text-muted">{m.comingSoon.categoriesHelp}</p>
          <div className="flex flex-col gap-5">
            {draft.categories.map((item, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 border-t border-border pt-4 first:border-0 first:pt-0"
              >
                <div className="flex flex-wrap items-end gap-4">
                  <Field label={m.comingSoon.categoryIcon}>
                    {(props) => (
                      <Select
                        {...props}
                        disabled={!editable}
                        value={item.icon}
                        onChange={(e) =>
                          updateItem('categories', i, {
                            icon: e.target.value as (typeof CATEGORY_ICONS)[number],
                          })
                        }
                      >
                        {CATEGORY_ICONS.map((icon) => (
                          <option key={icon} value={icon}>
                            {m.comingSoon.icons[icon]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  {rowTools('categories', i)}
                </div>
                <BilingualField
                  label={m.comingSoon.categoryTitle}
                  max={60}
                  disabled={!editable}
                  value={item.title}
                  onChange={(title) => updateItem('categories', i, { title })}
                />
                <BilingualField
                  label={m.comingSoon.categoryText}
                  max={200}
                  multiline
                  disabled={!editable}
                  value={item.text}
                  onChange={(text) => updateItem('categories', i, { text })}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card
          title={m.comingSoon.faq}
          actions={
            editable && draft.faq.length < 12 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  update({
                    faq: [
                      ...draft.faq,
                      { question: { ar: '', en: '' }, answer: { ar: '', en: '' } },
                    ],
                  })
                }
              >
                <Plus className="size-4" aria-hidden />
                {m.comingSoon.addFaq}
              </Button>
            ) : undefined
          }
        >
          <p className="mb-4 text-sm text-muted">{m.comingSoon.faqHelp}</p>
          <div className="flex flex-col gap-5">
            {draft.faq.map((item, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 border-t border-border pt-4 first:border-0 first:pt-0"
              >
                {rowTools('faq', i, 'self-end')}
                <BilingualField
                  label={m.comingSoon.faqQuestion}
                  max={160}
                  disabled={!editable}
                  value={item.question}
                  onChange={(question) => updateItem('faq', i, { question })}
                />
                <BilingualField
                  label={m.comingSoon.faqAnswer}
                  max={800}
                  multiline
                  disabled={!editable}
                  value={item.answer}
                  onChange={(answer) => updateItem('faq', i, { answer })}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card
          title={m.comingSoon.readiness}
          actions={
            editable && draft.readiness.length < 8 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  update({
                    readiness: [...draft.readiness, { label: { ar: '', en: '' }, percent: 0 }],
                  })
                }
              >
                <Plus className="size-4" aria-hidden />
                {m.comingSoon.addReadiness}
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-5">
            {draft.readiness.map((item, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 border-t border-border pt-4 first:border-0 first:pt-0"
              >
                <div className="flex items-end gap-4">
                  <Field label={m.comingSoon.readinessPercent}>
                    {(props) => (
                      <Input
                        {...props}
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        className="w-28"
                        disabled={!editable}
                        value={item.percent}
                        onChange={(e) =>
                          updateItem('readiness', i, {
                            percent: Math.max(
                              0,
                              Math.min(100, Math.round(Number(e.target.value) || 0)),
                            ),
                          })
                        }
                      />
                    )}
                  </Field>
                  {editable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ms-auto"
                      onClick={() => removeItem('readiness', i)}
                      aria-label={m.comingSoon.remove}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
                <BilingualField
                  label={m.comingSoon.readinessLabel}
                  max={60}
                  disabled={!editable}
                  value={item.label}
                  onChange={(label) => updateItem('readiness', i, { label })}
                />
              </div>
            ))}
          </div>
        </Card>

        <VersionHistory editor={editor} />
      </div>
    </>
  );
}

/* -------------------------------------- Sign-ups -------------------------------------- */

interface Subscriber {
  id: string;
  contactType: 'email' | 'whatsapp';
  contactValue: string;
  locale: string;
  createdAt: string;
}

export function Subscribers() {
  const { site, siteKey, can } = useCurrentSite();
  const { m, date } = useI18n();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['site', siteKey, 'subscribers', q],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (q.trim()) params.set('q', q.trim());
      if (pageParam) params.set('before', pageParam);
      return api<{ subscribers: Subscriber[]; next: string | null }>(
        sitePath(siteKey, `/subscribers?${params.toString()}`),
      );
    },
    getNextPageParam: (last) => last.next,
    enabled: site !== null,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(sitePath(siteKey, `/subscribers/${id}`), { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site', siteKey, 'subscribers'] }),
  });
  if (!site) return <Navigate to="/" replace />;
  const rows = list.data?.pages.flatMap((p) => p.subscribers) ?? [];
  return (
    <>
      <PageHeader
        title={m.subscribers.title}
        intro={m.subscribers.intro}
        actions={
          can('subscribers.export') && (
            <a
              href={`/api${sitePath(siteKey, '/subscribers/export')}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-surface px-4 font-medium hover:bg-bg"
            >
              <Download className="size-4" aria-hidden />
              {m.subscribers.export}
            </a>
          )
        }
      />
      <Card>
        <div className="mb-4 max-w-sm">
          <Field label={m.search}>
            {(props) => (
              <Input
                {...props}
                type="search"
                dir="ltr"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            )}
          </Field>
        </div>
        <ErrorText error={list.error ?? remove.error} />
        {list.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="text-muted">{m.subscribers.empty}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{m.subscribers.contact}</th>
                <th>{m.subscribers.type}</th>
                <th>{m.subscribers.language}</th>
                <th>{m.subscribers.date}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td dir="ltr" className="text-start">
                    {s.contactValue}
                  </td>
                  <td>
                    {s.contactType === 'email' ? m.subscribers.email : m.subscribers.whatsapp}
                  </td>
                  <td>{s.locale === 'ar' ? m.arabic : m.english}</td>
                  <td>{date(s.createdAt, true)}</td>
                  <td className="text-end">
                    {can('subscribers.delete') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={m.delete}
                        onClick={() => {
                          if (confirmAction(m.subscribers.deleteConfirm)) remove.mutate(s.id);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
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
    </>
  );
}
