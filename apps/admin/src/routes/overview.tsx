import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  FileText,
  Mail,
  MessageCircle,
  Palette,
  Rocket,
  Settings2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Link, Navigate } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ErrorText,
  Loading,
  PageHeader,
  StatCard,
  buttonVariants,
  cn,
} from '../components/ui';
import { api, sitePath } from '../lib/api';
import { useBilingual, useI18n } from '../lib/i18n';
import { useCurrentSite } from '../lib/session';

interface Overview {
  site: { key: string; mode: string; archived: boolean };
  subscribers: {
    total: number;
    last7Days: number;
    daily: { day: string; n: number }[];
    byType: Record<string, number>;
  };
  documents: Record<
    string,
    { draftUpdatedAt: string | null; published: { version: number; publishedAt: string } | null }
  >;
  jobs: { id: string; status: string; requestedAt: string }[];
}

const DAYS = 30;

/** The last 30 days, oldest first, with days without sign-ups as zero. */
function fillDays(daily: { day: string; n: number }[]) {
  const counts = new Map(daily.map((d) => [d.day, d.n]));
  const today = new Date();
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (DAYS - 1 - i)),
    );
    const day = d.toISOString().slice(0, 10);
    return { day, n: counts.get(day) ?? 0 };
  });
}

const editorPath: Record<string, string> = {
  'coming-soon': 'coming-soon',
  'site-settings': 'site-settings',
  theme: 'appearance',
};
const docIcon: Record<string, typeof FileText> = {
  'coming-soon': FileText,
  'site-settings': Settings2,
  theme: Palette,
};

export function SiteOverview() {
  const { site, siteKey } = useCurrentSite();
  const { m, format, date, locale, dir } = useI18n();
  const bi = useBilingual();
  const t = m.overview;
  const query = useQuery({
    queryKey: ['site', siteKey, 'overview'],
    queryFn: () => api<Overview>(sitePath(siteKey, '/overview')),
    enabled: site !== null,
  });
  if (!site) return <Navigate to="/" replace />;
  const data = query.data;
  const number = new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en');
  const shortDay = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

  const header = (
    <PageHeader
      eyebrow={bi(site.name)}
      title={t.title}
      intro={t.intro}
      actions={
        site.permissions.includes('comingSoon.view') && (
          <Link
            to={`/s/${site.key}/coming-soon`}
            className={buttonVariants({ variant: 'secondary' })}
          >
            <FileText aria-hidden />
            {t.editPage}
          </Link>
        )
      }
    />
  );
  if (query.isPending) {
    return (
      <>
        {header}
        <Loading />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {header}
        <ErrorText error={query.error} />
      </>
    );
  }

  const days = fillDays(data.subscribers.daily);
  const email = data.subscribers.byType['email'] ?? 0;
  const whatsapp = data.subscribers.byType['whatsapp'] ?? 0;
  const docs = Object.entries(data.documents);
  const publishedCount = docs.filter(([, d]) => d.published).length;
  const channels = [
    { name: t.email, value: email, color: 'var(--accent)' },
    { name: t.whatsapp, value: whatsapp, color: 'var(--success)' },
  ];

  return (
    <>
      {header}
      <div className="flex flex-col gap-4">
        {data.site.archived && <Alert tone="warning">{t.archived}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t.signups}
            value={number.format(data.subscribers.total)}
            icon={<Users />}
            hint={t.signupsHint}
          />
          <StatCard
            label={t.last7DaysLabel}
            value={`+${number.format(data.subscribers.last7Days)}`}
            icon={<TrendingUp />}
            tone="success"
            hint={t.last7Days}
          />
          <StatCard
            label={t.channels}
            value={`${number.format(email)} · ${number.format(whatsapp)}`}
            icon={<Mail />}
            tone="neutral"
            hint={`${t.email} · ${t.whatsapp}`}
          />
          <StatCard
            label={t.documents}
            value={format(t.publishedOf, { n: publishedCount, total: docs.length })}
            icon={<Rocket />}
            tone={publishedCount === docs.length ? 'success' : 'warning'}
            hint={m.mode[data.site.mode] ?? data.site.mode}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card
            title={t.trend}
            description={t.trendHelp}
            icon={<TrendingUp />}
            className="lg:col-span-2"
          >
            {data.subscribers.total === 0 ? (
              <EmptyState icon={<Users />} title={t.noSignups}>
                {t.noSignupsHelp}
              </EmptyState>
            ) : (
              <div className="h-64" dir="ltr" role="img" aria-label={t.trend}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="day"
                      reversed={dir === 'rtl'}
                      tickFormatter={(d: string) => shortDay.format(new Date(d))}
                      tick={{ fill: 'var(--muted)', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      orientation={dir === 'rtl' ? 'right' : 'left'}
                      tick={{ fill: 'var(--muted)', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ChartTooltip
                      cursor={{ fill: 'var(--surface-2)' }}
                      content={({ active, payload }) => {
                        const point = payload?.[0]?.payload as
                          { day: string; n: number } | undefined;
                        if (!active || !point) return null;
                        return (
                          <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
                            <p className="text-muted">{date(point.day)}</p>
                            <p className="font-semibold">
                              {format(t.signupsOnDay, { n: number.format(point.n) })}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="n"
                      fill="var(--accent)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={18}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card title={t.channels} description={t.channelsHelp} icon={<MessageCircle />}>
            {data.subscribers.total === 0 ? (
              <p className="text-sm text-muted">{t.noSignups}</p>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="relative size-40" role="img" aria-label={t.channels}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={channels}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="68%"
                        outerRadius="100%"
                        paddingAngle={2}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {channels.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <span>
                      <span className="block text-2xl font-semibold tabular-nums">
                        {number.format(data.subscribers.total)}
                      </span>
                      <span className="text-xs text-muted">{t.signupsShort}</span>
                    </span>
                  </div>
                </div>
                <ul className="w-full space-y-2 text-sm">
                  {channels.map((c) => (
                    <li key={c.name} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          'size-2.5 rounded-full',
                          c.name === t.email ? 'bg-accent' : 'bg-success',
                        )}
                      />
                      <span className="flex-1">{c.name}</span>
                      <span className="font-medium tabular-nums">{number.format(c.value)}</span>
                      <span className="w-12 text-end text-muted tabular-nums">
                        {Math.round((c.value / data.subscribers.total) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card
            title={t.documents}
            description={t.documentsHelp}
            icon={<FileText />}
            className="lg:col-span-2"
          >
            <ul className="-my-2 divide-y divide-border">
              {docs.map(([kind, doc]) => {
                const Icon = docIcon[kind] ?? FileText;
                return (
                  <li key={kind} className="flex items-center gap-4 py-3">
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted"
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {m.docs[kind] ?? kind}
                        {doc.published ? (
                          <Badge tone="success" dot>
                            v{doc.published.version}
                          </Badge>
                        ) : (
                          <Badge tone="warning" dot>
                            {t.notPublished}
                          </Badge>
                        )}
                        {doc.draftUpdatedAt && <Badge tone="accent">{t.draftPending}</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {doc.published
                          ? format(t.published, {
                              version: doc.published.version,
                              date: date(doc.published.publishedAt, true),
                            })
                          : t.notPublished}
                        {' · '}
                        {doc.draftUpdatedAt
                          ? format(t.draftSaved, { date: date(doc.draftUpdatedAt, true) })
                          : t.noDraft}
                      </p>
                    </div>
                    {editorPath[kind] && (
                      <Link
                        to={`/s/${site.key}/${editorPath[kind]}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        aria-label={`${t.open}: ${m.docs[kind] ?? kind}`}
                      >
                        {t.open}
                        <ArrowUpRight aria-hidden className="rtl:-scale-x-100" />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title={t.jobs} icon={<CalendarClock />}>
            {data.jobs.length === 0 ? (
              <EmptyState icon={<Rocket />} title={t.noJobs} />
            ) : (
              <ol className="relative space-y-4 border-s border-border ps-5">
                {data.jobs.map((job) => {
                  const done = job.status === 'succeeded';
                  const failed = job.status === 'failed';
                  return (
                    <li key={job.id} className="relative">
                      <span
                        aria-hidden
                        className={cn(
                          'absolute -start-[1.6rem] top-0.5 grid size-5 place-items-center rounded-full bg-surface',
                          done ? 'text-success' : failed ? 'text-danger' : 'text-accent-text',
                        )}
                      >
                        {done ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <CircleDashed className={cn('size-4', !failed && 'animate-spin')} />
                        )}
                      </span>
                      <Badge tone={done ? 'success' : failed ? 'danger' : 'accent'}>
                        {m.job[job.status] ?? job.status}
                      </Badge>
                      <p className="mt-1 text-xs text-muted">{date(job.requestedAt, true)}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
