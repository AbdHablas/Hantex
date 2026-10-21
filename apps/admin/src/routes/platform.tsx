import { LOCALES, SITE_MODES, SITE_TEMPLATES, newSiteSchema } from '@hantex/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { Fragment, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useRefreshMe } from '../components/Shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  ErrorText,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
  Table,
  confirmAction,
} from '../components/ui';
import { ApiError, api, sitePath } from '../lib/api';
import { useBilingual, useI18n } from '../lib/i18n';
import { registerPasskey } from '../lib/passkey';
import { meQueryKey, useCurrentSite, useMe, usePlatform } from '../lib/session';
import { useRoles } from './staff';

/** "/" — opens the first website the person can use. */
export function Home() {
  const { data: me } = useMe();
  if (!me) return <Loading />;
  const first = me.sites.find((s) => !s.archived) ?? me.sites[0];
  return <Navigate to={first ? `/s/${first.key}` : '/sites'} replace />;
}

/* --------------------------------------- Websites --------------------------------------- */

function CreateSiteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { m } = useI18n();
  const navigate = useNavigate();
  const refreshMe = useRefreshMe();
  const [form, setForm] = useState({
    key: '',
    nameAr: '',
    nameEn: '',
    locales: ['ar', 'en'] as string[],
    defaultLocale: 'ar',
    template: 'coming-soon',
  });
  const body = {
    key: form.key.trim(),
    name: { ar: form.nameAr, en: form.nameEn },
    locales: form.locales,
    defaultLocale: form.defaultLocale,
    template: form.template,
  };
  const valid = newSiteSchema.safeParse(body);
  const create = useMutation({
    mutationFn: () => api<{ key: string }>('/sites', { method: 'POST', body }),
    onSuccess: async ({ key }) => {
      await refreshMe();
      onClose();
      void navigate(`/s/${key}/settings`);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid.success) create.mutate();
  };
  const toggleLocale = (locale: string) =>
    setForm((f) => ({
      ...f,
      locales: f.locales.includes(locale)
        ? f.locales.filter((l) => l !== locale)
        : [...f.locales, locale],
    }));
  return (
    <Dialog open={open} onClose={onClose} title={m.sites['create']}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={m.sites['key']} help={m.sites['keyHelp']}>
          {(props) => (
            <Input
              {...props}
              required
              dir="ltr"
              pattern="[a-z0-9-]{2,40}"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase() })}
            />
          )}
        </Field>
        <Field label={m.sites['nameAr']}>
          {(props) => (
            <Input
              {...props}
              required
              lang="ar"
              dir="rtl"
              maxLength={80}
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            />
          )}
        </Field>
        <Field label={m.sites['nameEn']}>
          {(props) => (
            <Input
              {...props}
              required
              lang="en"
              dir="ltr"
              maxLength={80}
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{m.sites['languages']}</legend>
          {LOCALES.map((locale) => (
            <label key={locale} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-accent"
                checked={form.locales.includes(locale)}
                onChange={() => toggleLocale(locale)}
              />
              {locale === 'ar' ? m.arabic : m.english}
            </label>
          ))}
        </fieldset>
        <Field label={m.sites['defaultLanguage']}>
          {(props) => (
            <Select
              {...props}
              value={form.defaultLocale}
              onChange={(e) => setForm({ ...form, defaultLocale: e.target.value })}
            >
              {form.locales.map((locale) => (
                <option key={locale} value={locale}>
                  {locale === 'ar' ? m.arabic : m.english}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={m.sites['template']}>
          {(props) => (
            <Select
              {...props}
              value={form.template}
              onChange={(e) => setForm({ ...form, template: e.target.value })}
            >
              {SITE_TEMPLATES.map((t) => (
                <option key={t} value={t}>
                  {m.sites[`template.${t}`] ?? t}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button type="submit" disabled={!valid.success} busy={create.isPending}>
            {m.create}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function Sites() {
  const { me, can } = usePlatform();
  const { m } = useI18n();
  const bi = useBilingual();
  const [creating, setCreating] = useState(false);
  if (!me) return null;
  return (
    <>
      <PageHeader
        title={m.sites['title']}
        intro={m.sites['intro']}
        actions={
          can('sites.manage') && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              {m.sites['create']}
            </Button>
          )
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {me.sites.map((site) => (
          <Card
            key={site.key}
            title={bi(site.name)}
            actions={
              <Badge tone={site.mode === 'live' ? 'success' : 'warning'}>
                {m.mode[site.mode] ?? site.mode}
              </Badge>
            }
          >
            <p dir="ltr" className="text-start text-sm text-muted">
              {site.key}
            </p>
            {site.role && <p className="mt-1 text-sm">{bi(site.role.name)}</p>}
            {site.archived && <Badge tone="danger">{m.sites['archived']}</Badge>}
            <Link
              to={`/s/${site.key}`}
              className="mt-4 inline-block text-accent-text underline-offset-4 hover:underline"
            >
              {m.sites['open']}
            </Link>
          </Card>
        ))}
      </div>
      {can('sites.manage') && (
        <CreateSiteDialog open={creating} onClose={() => setCreating(false)} />
      )}
    </>
  );
}

interface SiteConfig {
  key: string;
  name: { ar: string; en: string };
  locales: string[];
  defaultLocale: string;
  mode: string;
  template: string;
  archived: boolean;
  domains: { id: string; hostname: string; isPrimary: boolean; status: string }[];
}

export function SiteSettings() {
  const { site, siteKey, can } = useCurrentSite();
  const { me } = usePlatform();
  const { m, format } = useI18n();
  const queryClient = useQueryClient();
  const refreshMe = useRefreshMe();
  const key = ['site', siteKey, 'config'];
  const config = useQuery({
    queryKey: key,
    queryFn: () => api<SiteConfig>(sitePath(siteKey)),
    enabled: site !== null,
  });
  const [hostname, setHostname] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await refreshMe();
  };
  const addDomain = useMutation({
    mutationFn: () =>
      api(sitePath(siteKey, '/domains'), { method: 'POST', body: { hostname, isPrimary } }),
    onSuccess: async () => {
      setHostname('');
      setIsPrimary(false);
      await refresh();
    },
  });
  const removeDomain = useMutation({
    mutationFn: (id: string) => api(sitePath(siteKey, `/domains/${id}`), { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const setMode = useMutation({
    mutationFn: (mode: string) =>
      api(sitePath(siteKey, '/mode'), { method: 'PUT', body: { mode } }),
    onSuccess: refresh,
  });
  const archive = useMutation({
    mutationFn: (restore: boolean) =>
      api(sitePath(siteKey, restore ? '/restore' : '/archive'), { method: 'POST', body: {} }),
    onSuccess: refresh,
  });

  if (!site) return <Navigate to="/" replace />;
  if (config.isPending) return <Loading />;
  if (!config.data) return <ErrorText error={config.error} />;
  const ownsSites = me?.permissions.includes('sites.manage') === true;
  const c = config.data;

  return (
    <>
      <PageHeader title={m.site['title']} intro={`${c.name.ar} · ${c.name.en}`} />
      <div className="flex flex-col gap-4">
        <ErrorText
          error={addDomain.error ?? removeDomain.error ?? setMode.error ?? archive.error}
        />
        <Card title={m.site['details']}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">{m.sites['key']}</dt>
              <dd dir="ltr" className="text-start">
                {c.key}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{m.sites['template']}</dt>
              <dd>{m.sites[`template.${c.template}`] ?? c.template}</dd>
            </div>
            <div>
              <dt className="text-muted">{m.sites['languages']}</dt>
              <dd>{c.locales.map((l) => (l === 'ar' ? m.arabic : m.english)).join('، ')}</dd>
            </div>
            <div>
              <dt className="text-muted">{m.sites['defaultLanguage']}</dt>
              <dd>{c.defaultLocale === 'ar' ? m.arabic : m.english}</dd>
            </div>
          </dl>
        </Card>

        <Card title={m.site['mode']}>
          <p className="mb-3 text-sm text-muted">{m.site['modeIntro']}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={m.site['mode']}>
            {SITE_MODES.map((mode) => (
              <Button
                key={mode}
                variant={c.mode === mode ? 'primary' : 'secondary'}
                aria-pressed={c.mode === mode}
                disabled={!can('siteMode.manage') || c.archived || c.mode === mode}
                busy={setMode.isPending && setMode.variables === mode}
                onClick={() => {
                  if (
                    confirmAction(
                      format(m.site['modeConfirm'] ?? '', { mode: m.mode[mode] ?? mode }),
                    )
                  )
                    setMode.mutate(mode);
                }}
              >
                {m.mode[mode] ?? mode}
              </Button>
            ))}
          </div>
        </Card>

        <Card title={m.site['domains']}>
          <p className="mb-3 text-sm text-muted">{m.site['domainsIntro']}</p>
          <Table>
            <thead>
              <tr>
                <th>{m.site['hostname']}</th>
                <th>{m.site['status']}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {c.domains.map((d) => (
                <tr key={d.id}>
                  <td dir="ltr" className="text-start">
                    {d.hostname} {d.isPrimary && <Badge tone="accent">{m.site['primary']}</Badge>}
                  </td>
                  <td>
                    <Badge tone={d.status === 'active' ? 'success' : 'warning'}>
                      {m.site[`status.${d.status}`] ?? d.status}
                    </Badge>
                  </td>
                  <td className="text-end">
                    {ownsSites && d.status === 'pending' && !c.archived && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={m.remove}
                        onClick={() => removeDomain.mutate(d.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {ownsSites && !c.archived && (
            <form
              className="mt-4 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                addDomain.mutate();
              }}
            >
              <Field label={m.site['hostname']} className="min-w-64 flex-1">
                {(props) => (
                  <Input
                    {...props}
                    required
                    dir="ltr"
                    placeholder="www.example.com"
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                  />
                )}
              </Field>
              <label className="flex h-10 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                />
                {m.site['primary']}
              </label>
              <Button type="submit" variant="secondary" busy={addDomain.isPending}>
                {m.site['addDomain']}
              </Button>
            </form>
          )}
        </Card>

        {ownsSites && (
          <Card>
            {c.archived ? (
              <Button
                variant="secondary"
                busy={archive.isPending}
                onClick={() => archive.mutate(true)}
              >
                {m.site['restore']}
              </Button>
            ) : (
              <Button
                variant="danger"
                busy={archive.isPending}
                onClick={() => {
                  if (confirmAction(m.site['archiveConfirm'] ?? '')) archive.mutate(false);
                }}
              >
                {m.site['archive']}
              </Button>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

/* ----------------------------------------- Roles ----------------------------------------- */

export function Roles() {
  const { can } = usePlatform();
  const { m, format } = useI18n();
  const bi = useBilingual();
  const queryClient = useQueryClient();
  const roles = useRoles();
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState({ ar: '', en: '' });
  const refresh = async () => {
    setEdits({});
    await queryClient.invalidateQueries({ queryKey: ['roles'] });
    await queryClient.invalidateQueries({ queryKey: meQueryKey });
  };
  const save = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) =>
      api(`/roles/${id}/permissions`, { method: 'PUT', body: { permissions } }),
    onSuccess: refresh,
  });
  const reset = useMutation({
    mutationFn: (id: string) => api(`/roles/${id}/reset`, { method: 'POST', body: {} }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: () =>
      api('/roles', {
        method: 'POST',
        body: { name: newName, description: { ar: '', en: '' }, permissions: [] },
      }),
    onSuccess: async () => {
      setCreating(false);
      setNewName({ ar: '', en: '' });
      await refresh();
    },
  });

  if (roles.isPending) return <Loading />;
  if (!roles.data) return <ErrorText error={roles.error} />;
  const editable = can('roles.manage');
  const { permissions, roles: list } = roles.data;
  const groups = [...new Set(permissions.map((p) => p.group))];
  const current = (id: string, fallback: string[]) => edits[id] ?? fallback;

  return (
    <>
      <PageHeader
        title={m.roles.title}
        intro={m.roles.intro}
        actions={
          editable && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              {m.roles.newRole}
            </Button>
          )
        }
      />
      <ErrorText error={save.error ?? reset.error ?? remove.error} />
      <Card>
        <Table>
          <thead>
            <tr>
              <th scope="col">{m.roles.permission}</th>
              {list.map((role) => (
                <th key={role.id} scope="col" className="min-w-28 align-bottom">
                  <span className="block text-text">{bi(role.name)}</span>
                  <span className="block text-xs">
                    {role.locked
                      ? m.roles.locked
                      : role.isStandard
                        ? m.roles.standard
                        : m.roles.custom}{' '}
                    · {format(m.roles.members, { count: role.members })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr>
                  <th colSpan={list.length + 1} scope="colgroup" className="bg-bg">
                    {m.roles.group[group] ?? group}
                  </th>
                </tr>
                {permissions
                  .filter((p) => p.group === group)
                  .map((p) => (
                    <tr key={p.id}>
                      <th scope="row" className="font-normal text-text">
                        {bi(p.label)}{' '}
                        {p.reserved && <Badge tone="warning">{m.roles.reserved}</Badge>}{' '}
                        {p.scope === 'platform' && <Badge tone="accent">{m.roles.platform}</Badge>}{' '}
                        {p.sensitive && <Badge tone="danger">{m.roles.sensitive}</Badge>}
                      </th>
                      {list.map((role) => {
                        const held = current(role.id, role.permissions);
                        const checked = held.includes(p.id);
                        return (
                          <td key={role.id} className="text-center">
                            <input
                              type="checkbox"
                              className="size-4 accent-accent"
                              aria-label={`${bi(role.name)}: ${bi(p.label)}`}
                              checked={checked}
                              disabled={!editable || role.locked || p.reserved}
                              onChange={() =>
                                setEdits({
                                  ...edits,
                                  [role.id]: checked
                                    ? held.filter((x) => x !== p.id)
                                    : [...held, p.id],
                                })
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
          {editable && (
            <tfoot>
              <tr>
                <td />
                {list.map((role) => (
                  <td key={role.id} className="text-center">
                    {!role.locked && (
                      <div className="flex flex-col items-center gap-1">
                        {edits[role.id] && (
                          <Button
                            size="sm"
                            busy={save.isPending}
                            onClick={() =>
                              save.mutate({ id: role.id, permissions: edits[role.id] ?? [] })
                            }
                          >
                            {m.save}
                          </Button>
                        )}
                        {role.isStandard ? (
                          <Button size="sm" variant="ghost" onClick={() => reset.mutate(role.id)}>
                            {m.roles.reset}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={role.members > 0}
                            onClick={() => {
                              if (confirmAction(m.roles.deleteRole)) remove.mutate(role.id);
                            }}
                          >
                            {m.roles.deleteRole}
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </Table>
      </Card>
      <Dialog open={creating} onClose={() => setCreating(false)} title={m.roles.newRole}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label={m.roles.roleNameAr}>
            {(props) => (
              <Input
                {...props}
                required
                lang="ar"
                dir="rtl"
                maxLength={60}
                value={newName.ar}
                onChange={(e) => setNewName({ ...newName, ar: e.target.value })}
              />
            )}
          </Field>
          <Field label={m.roles.roleNameEn}>
            {(props) => (
              <Input
                {...props}
                required
                lang="en"
                dir="ltr"
                maxLength={60}
                value={newName.en}
                onChange={(e) => setNewName({ ...newName, en: e.target.value })}
              />
            )}
          </Field>
          <ErrorText error={create.error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {m.cancel}
            </Button>
            <Button type="submit" busy={create.isPending}>
              {m.create}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/* --------------------------------------- Audit log --------------------------------------- */

interface AuditEntry {
  id: number;
  occurredAt: string;
  actorLabel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
}

export function AuditLog({ scope }: { scope: 'site' | 'platform' }) {
  const { site, siteKey } = useCurrentSite();
  const { m, date } = useI18n();
  const bi = useBilingual();
  const base = scope === 'site' ? sitePath(siteKey, '/audit') : '/audit';
  const list = useInfiniteQuery({
    queryKey: ['audit', base],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      api<{ entries: AuditEntry[]; next: number | null }>(
        `${base}?limit=50${pageParam ? `&before=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.next,
    enabled: scope === 'platform' || site !== null,
  });
  const rows = list.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <>
      <PageHeader
        title={scope === 'site' ? m.audit.title : m.nav.fullAudit}
        intro={scope === 'site' && site ? bi(site.name) : undefined}
      />
      <Card>
        <ErrorText error={list.error} />
        {list.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="text-muted">{m.audit.empty}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{m.audit.when}</th>
                <th>{m.audit.who}</th>
                <th>{m.audit.action}</th>
                <th>{m.audit.target}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{date(e.occurredAt, true)}</td>
                  <td dir="ltr" className="text-start">
                    {e.actorLabel}
                  </td>
                  <td dir="ltr" className="text-start font-mono text-xs">
                    {e.action}
                  </td>
                  <td dir="ltr" className="text-start text-muted">
                    {[e.targetType, e.targetId].filter(Boolean).join(': ')}
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

/* ---------------------------------------- Account ---------------------------------------- */

export function Account() {
  const { data: me } = useMe();
  const { m, format, date, errorText } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const recovered = (location.state as { recovered?: boolean } | null)?.recovered === true;
  const passkeys = useQuery({
    queryKey: ['me', 'passkeys'],
    queryFn: () =>
      api<{ id: string; name: string | null; createdAt: string; backedUp: boolean }[]>(
        '/me/passkeys',
      ),
  });
  const [codes, setCodes] = useState<string[] | null>(null);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  };
  const add = useMutation({ mutationFn: () => registerPasskey({}), onSuccess: refresh });
  const removeKey = useMutation({
    mutationFn: (id: string) => api(`/me/passkeys/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const newCodes = useMutation({
    mutationFn: () => api<{ codes: string[] }>('/me/recovery-codes', { method: 'POST', body: {} }),
    onSuccess: async (result) => {
      setCodes(result.codes);
      await refresh();
    },
  });
  const everywhere = useMutation({
    mutationFn: () => api('/me/sign-out-everywhere', { method: 'POST', body: {} }),
    onSuccess: () => {
      queryClient.clear();
      void navigate('/sign-in', { replace: true });
    },
  });
  if (!me) return null;
  const reauth = [add.error, removeKey.error, newCodes.error].some(
    (e) => e instanceof ApiError && e.code === 'reauthenticate',
  );

  return (
    <>
      <PageHeader title={m.account.title} intro={`${me.name} · ${me.email}`} />
      <div className="flex flex-col gap-4">
        {recovered && <Alert tone="success">{m.auth.recovered}</Alert>}
        {reauth && <Alert tone="warning">{m.account.reauth}</Alert>}
        <Card
          title={m.account.passkeys}
          actions={
            <Button variant="secondary" busy={add.isPending} onClick={() => add.mutate()}>
              <KeyRound className="size-4" aria-hidden />
              {m.account.addPasskey}
            </Button>
          }
        >
          <p className="mb-3 text-sm text-muted">{m.account.passkeysIntro}</p>
          {!reauth && (add.error || removeKey.error) && (
            <Alert tone="danger">{errorText(add.error ?? removeKey.error)}</Alert>
          )}
          <ul className="flex flex-col gap-2">
            {passkeys.data?.map((p) => (
              <li key={p.id} className="flex items-center gap-3 text-sm">
                <KeyRound className="size-4 text-muted" aria-hidden />
                <span>{p.name ?? 'Passkey'}</span>
                <span className="text-muted">
                  {format(m.account.added, { date: date(p.createdAt) })}
                </span>
                {p.backedUp && <Badge>{m.account.synced}</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ms-auto"
                  disabled={(passkeys.data?.length ?? 0) <= 1}
                  aria-label={m.remove}
                  onClick={() => removeKey.mutate(p.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={m.account.recovery}>
          <p className="mb-3 text-sm text-muted">{m.account.recoveryIntro}</p>
          <p className="mb-3">{format(m.account.recoveryLeft, { count: me.recoveryCodesLeft })}</p>
          {codes && (
            <div className="mb-3 flex flex-col gap-2">
              <Alert tone="warning">{m.account.codesShown}</Alert>
              <ul dir="ltr" className="grid grid-cols-2 gap-2 font-mono">
                {codes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </div>
          )}
          {!reauth && newCodes.error && <Alert tone="danger">{errorText(newCodes.error)}</Alert>}
          <Button
            variant="secondary"
            busy={newCodes.isPending}
            onClick={() => {
              if (me.recoveryCodesLeft === 0 || confirmAction(m.account.newCodesConfirm))
                newCodes.mutate();
            }}
          >
            {m.account.newCodes}
          </Button>
        </Card>
        <Card>
          <Button variant="danger" busy={everywhere.isPending} onClick={() => everywhere.mutate()}>
            {m.account.signOutEverywhere}
          </Button>
        </Card>
      </div>
    </>
  );
}
