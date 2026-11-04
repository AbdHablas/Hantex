import type { EnquiryStatus } from '@hantex/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Mail, MessageCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router';
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
  confirmAction,
  later,
} from '../components/ui';
import { api, sitePath } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useCurrentSite } from '../lib/session';

/**
 * Enquiries and quotation requests sent from the website (D-051). Personal data: shown to
 * people with enquiries.view only; status changes and deletions are recorded in the audit log.
 */
interface Enquiry {
  id: string;
  kind: 'enquiry' | 'quote';
  productId: string | null;
  productName: string;
  name: string;
  contactType: 'email' | 'whatsapp';
  contactValue: string;
  company: string;
  quantity: number | null;
  message: string;
  locale: 'ar' | 'en';
  status: EnquiryStatus;
  createdAt: string;
}

const STATUSES: EnquiryStatus[] = ['new', 'replied', 'closed'];

export function Enquiries() {
  const { site, siteKey, can } = useCurrentSite();
  const { m, date, format } = useI18n();
  const t = m.enquiries;
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<EnquiryStatus | ''>('new');
  const key = ['site', siteKey, 'enquiries'];
  const list = useInfiniteQuery({
    queryKey: [...key, q, status],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (q.trim()) params.set('q', q.trim());
      if (status) params.set('status', status);
      if (pageParam) params.set('before', pageParam);
      return api<{ enquiries: Enquiry[]; next: string | null }>(
        sitePath(siteKey, `/enquiries?${params.toString()}`),
      );
    },
    getNextPageParam: (last) => last.next,
    enabled: site !== null,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['site', siteKey] });
  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: EnquiryStatus }) =>
      api(sitePath(siteKey, `/enquiries/${id}`), { method: 'PATCH', body: { status: next } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(sitePath(siteKey, `/enquiries/${id}`), { method: 'DELETE' }),
    onSuccess: refresh,
  });
  if (!site) return <Navigate to="/" replace />;
  const rows = list.data?.pages.flatMap((p) => p.enquiries) ?? [];
  const tone = (s: EnquiryStatus) =>
    s === 'new' ? 'accent' : s === 'replied' ? 'success' : 'neutral';
  return (
    <>
      <PageHeader
        title={t.title}
        intro={t.intro}
        actions={
          can('enquiries.export') && (
            <a
              href={`/api${sitePath(siteKey, '/enquiries/export')}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-surface px-4 font-medium hover:bg-bg"
            >
              <Download className="size-4" aria-hidden />
              {t.export}
            </a>
          )
        }
      />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Field label={t.show}>
            {(props) => (
              <Select
                {...props}
                value={status}
                onChange={(e) => setStatus(e.target.value as EnquiryStatus | '')}
              >
                <option value="">{t.all}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t.status[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={m.search}>
            {(props) => (
              <Input {...props} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
            )}
          </Field>
        </div>
        <ErrorText error={list.error ?? update.error ?? remove.error} />
        {list.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="text-muted">{t.empty}</p>
        ) : (
          <ul className="grid gap-3" aria-label={t.title}>
            {rows.map((e) => {
              const contactHref =
                e.contactType === 'email'
                  ? `mailto:${e.contactValue}`
                  : `https://wa.me/${e.contactValue.replace('+', '')}`;
              return (
                <li key={e.id} className="rounded-xl border border-border p-4">
                  <article aria-labelledby={`enquiry-${e.id}`} className="grid gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 id={`enquiry-${e.id}`} className="font-semibold">
                          {e.name}
                        </h2>
                        <p className="text-sm text-muted">
                          {date(e.createdAt, true)} · {e.locale === 'ar' ? m.arabic : m.english}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={e.kind === 'quote' ? 'warning' : 'neutral'}>
                          {e.kind === 'quote' ? t.quote : t.enquiry}
                        </Badge>
                        <Badge tone={tone(e.status)} dot>
                          {t.status[e.status]}
                        </Badge>
                      </div>
                    </div>
                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                      <dt className="text-muted">{t.contact}</dt>
                      <dd>
                        <a
                          href={contactHref}
                          rel="noopener noreferrer"
                          target={e.contactType === 'email' ? undefined : '_blank'}
                          dir="ltr"
                          className="inline-flex items-center gap-1.5 text-accent-text underline-offset-2 hover:underline"
                        >
                          {e.contactType === 'email' ? (
                            <Mail className="size-4" aria-hidden />
                          ) : (
                            <MessageCircle className="size-4" aria-hidden />
                          )}
                          {e.contactValue}
                        </a>
                      </dd>
                      {e.productName && (
                        <>
                          <dt className="text-muted">{t.product}</dt>
                          <dd>{e.productName}</dd>
                        </>
                      )}
                      {e.quantity !== null && (
                        <>
                          <dt className="text-muted">{t.quantity}</dt>
                          <dd dir="ltr" className="text-start">
                            {e.quantity}
                          </dd>
                        </>
                      )}
                      {e.company && (
                        <>
                          <dt className="text-muted">{t.company}</dt>
                          <dd>{e.company}</dd>
                        </>
                      )}
                    </dl>
                    <p
                      className="whitespace-pre-wrap break-words rounded-lg bg-bg p-3 text-sm"
                      dir="auto"
                    >
                      {e.message}
                    </p>
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      {can('enquiries.manage') ? (
                        <Field label={format(t.statusOf, { name: e.name })}>
                          {(props) => (
                            <Select
                              {...props}
                              value={e.status}
                              disabled={update.isPending}
                              onChange={(ev) =>
                                update.mutate({ id: e.id, next: ev.target.value as EnquiryStatus })
                              }
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {t.status[s]}
                                </option>
                              ))}
                            </Select>
                          )}
                        </Field>
                      ) : (
                        <span />
                      )}
                      {can('enquiries.delete') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={format(t.deleteOf, { name: e.name })}
                          onClick={later(async () => {
                            if (await confirmAction(t.deleteConfirm)) remove.mutate(e.id);
                          })}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
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
    </>
  );
}
