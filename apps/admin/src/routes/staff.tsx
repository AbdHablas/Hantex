import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
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
  later,
} from '../components/ui';
import { api, sitePath } from '../lib/api';
import { useBilingual, useI18n } from '../lib/i18n';
import { useCurrentSite, useMe, usePlatform, type Bilingual } from '../lib/session';

interface RoleSummary {
  id: string;
  name: Bilingual;
  protected: boolean;
  locked: boolean;
  permissions: string[];
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () =>
      api<{
        permissions: {
          id: string;
          group: string;
          scope: 'site' | 'platform';
          label: Bilingual;
          sensitive: string | null;
          reserved: boolean;
        }[];
        roles: (RoleSummary & { description: Bilingual; isStandard: boolean; members: number })[];
      }>('/roles'),
  });
}

interface Invitation {
  id: string;
  email: string;
  roleId: string;
  site?: string | null;
  expiresAt: string;
}

/**
 * The roles this person may offer. The server makes the final check; here roles that would
 * clearly be refused (more permissions than the person holds, Owner on one site) are hidden.
 */
function offerable(roles: RoleSummary[], held: readonly string[], scope: 'site' | 'all') {
  return roles.filter(
    (r) =>
      !(scope === 'site' && r.locked) &&
      (!r.protected || held.includes('staff.manageAdmins')) &&
      r.permissions.every((p) => held.includes(p)),
  );
}

function InviteDialog({
  open,
  onClose,
  path,
  roles,
  help,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  roles: RoleSummary[];
  help: string;
}) {
  const { m } = useI18n();
  const bi = useBilingual();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const invite = useMutation({
    mutationFn: () => api(path, { method: 'POST', body: { email, name, roleId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      setEmail('');
      setName('');
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    invite.mutate();
  };
  return (
    <Dialog open={open} onClose={onClose} title={m.staff.inviteTitle}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <p className="text-sm text-muted">{help}</p>
        <Field label={m.staff.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={
            <>
              {m.staff.name} <span className="text-muted">({m.optional})</span>
            </>
          }
        >
          {(props) => (
            <Input
              {...props}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={m.staff.role}>
          {(props) => (
            <Select {...props} required value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="" />
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {bi(r.name)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ErrorText error={invite.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button type="submit" busy={invite.isPending}>
            {m.staff.invite}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PendingInvitations({ path }: { path: string }) {
  const { m, format, date } = useI18n();
  const bi = useBilingual();
  const queryClient = useQueryClient();
  const roles = useRoles();
  const list = useQuery({
    queryKey: ['staff', path, 'invitations'],
    queryFn: () => api<Invitation[]>(`${path}/invitations`),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`${path}/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });
  if (!list.data || list.data.length === 0) return null;
  const roleName = (id: string) => bi(roles.data?.roles.find((r) => r.id === id)?.name) || id;
  return (
    <Card title={m.staff.pending}>
      <ErrorText error={revoke.error} />
      <ul className="flex flex-col gap-2">
        {list.data.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 text-sm">
            <span dir="ltr">{inv.email}</span>
            <Badge>{roleName(inv.roleId)}</Badge>
            {inv.site === null && <Badge tone="accent">{m.staff.allSites}</Badge>}
            <span className="text-muted">
              {format(m.staff.expires, { date: date(inv.expiresAt) })}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ms-auto"
              onClick={() => revoke.mutate(inv.id)}
            >
              {m.staff.revoke}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface SiteStaffMember {
  id: string;
  name: string;
  email: string;
  status: string;
  passkeys: number;
  allSites: boolean;
  role: { id: string; name: Bilingual } | null;
}

export function SiteStaff() {
  const { site, siteKey, can } = useCurrentSite();
  const { data: me } = useMe();
  const { m, format } = useI18n();
  const bi = useBilingual();
  const queryClient = useQueryClient();
  const roles = useRoles();
  const path = sitePath(siteKey, '/staff');
  const list = useQuery({
    queryKey: ['staff', path],
    queryFn: () => api<SiteStaffMember[]>(path),
    enabled: site !== null,
  });
  const [inviting, setInviting] = useState(false);
  const setRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api(`${path}/${userId}/role`, { method: 'PUT', body: { roleId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });
  const removeAccess = useMutation({
    mutationFn: (userId: string) => api(`${path}/${userId}/role`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });

  if (!site) return <Navigate to="/" replace />;
  const manages = can('staff.manage') && !site.archived;
  const choices = offerable(roles.data?.roles ?? [], site.permissions, 'site');

  return (
    <>
      <PageHeader
        title={m.staff.title}
        intro={bi(site.name)}
        actions={
          manages && (
            <Button onClick={() => setInviting(true)}>
              <UserPlus className="size-4" aria-hidden />
              {m.staff.invite}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4">
        <ErrorText error={list.error ?? setRole.error ?? removeAccess.error} />
        <Card>
          {list.isPending ? (
            <Loading />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{m.staff.name}</th>
                  <th>{m.staff.role}</th>
                  <th>{m.staff.status}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data?.map((person) => {
                  const self = person.id === me?.id;
                  return (
                    <tr key={person.id}>
                      <td>
                        <p className="font-medium">
                          {person.name}{' '}
                          {self && <span className="text-muted">({m.staff.you})</span>}
                        </p>
                        <p dir="ltr" className="text-start text-muted">
                          {person.email}
                        </p>
                      </td>
                      <td>
                        {manages && !person.allSites && !self ? (
                          <Select
                            aria-label={m.staff.changeRole}
                            value={person.role?.id ?? ''}
                            onChange={(e) =>
                              setRole.mutate({ userId: person.id, roleId: e.target.value })
                            }
                          >
                            {person.role && !choices.some((r) => r.id === person.role?.id) && (
                              <option value={person.role.id}>{bi(person.role.name)}</option>
                            )}
                            {choices.map((r) => (
                              <option key={r.id} value={r.id}>
                                {bi(r.name)}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="flex flex-wrap items-center gap-2">
                            {bi(person.role?.name)}
                            {person.allSites && <Badge tone="accent">{m.staff.allSites}</Badge>}
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge tone={person.status === 'active' ? 'success' : 'danger'}>
                          {person.status === 'active' ? m.staff.active : m.staff.disabled}
                        </Badge>
                      </td>
                      <td className="text-end">
                        {manages && !person.allSites && !self && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={later(async () => {
                              if (
                                await confirmAction(
                                  format(m.staff.removeConfirm, { name: person.name }),
                                )
                              )
                                removeAccess.mutate(person.id);
                            })}
                          >
                            {m.remove}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {manages && <p className="mt-4 text-sm text-muted">{m.staff.allSitesNote}</p>}
        </Card>
        {can('staff.view') && <PendingInvitations path={path} />}
      </div>
      {manages && (
        <InviteDialog
          open={inviting}
          onClose={() => setInviting(false)}
          path={`${path}/invitations`}
          roles={choices}
          help={m.staff.inviteSiteHelp}
        />
      )}
    </>
  );
}

interface PlatformStaffMember {
  id: string;
  name: string;
  email: string;
  status: string;
  passkeys: number;
  roles: { site: string | null; role: { id: string; name: Bilingual } }[];
}

export function PlatformStaff() {
  const { me, can } = usePlatform();
  const { m, format } = useI18n();
  const bi = useBilingual();
  const queryClient = useQueryClient();
  const roles = useRoles();
  const list = useQuery({
    queryKey: ['staff', 'platform'],
    queryFn: () => api<PlatformStaffMember[]>('/staff'),
    enabled: can('staff.view'),
  });
  const [inviting, setInviting] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['staff'] });
  const setRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api(`/staff/${userId}/role`, { method: 'PUT', body: { roleId } }),
    onSuccess: refresh,
  });
  const toggle = useMutation({
    mutationFn: ({ userId, enable }: { userId: string; enable: boolean }) =>
      api(`/staff/${userId}/${enable ? 'enable' : 'disable'}`, { method: 'POST', body: {} }),
    onSuccess: refresh,
  });

  if (!me) return null;
  if (!can('staff.view')) return <Alert tone="warning">{m.errors['missing-permission']}</Alert>;
  const manages = can('staff.manage');
  const choices = offerable(roles.data?.roles ?? [], me.permissions, 'all');
  const siteName = (key: string) => bi(me.sites.find((s) => s.key === key)?.name) || key;

  return (
    <>
      <PageHeader
        title={m.staff.platformTitle}
        actions={
          manages && (
            <Button onClick={() => setInviting(true)}>
              <UserPlus className="size-4" aria-hidden />
              {m.staff.invite}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4">
        <ErrorText error={list.error ?? setRole.error ?? toggle.error} />
        <Card>
          {list.isPending ? (
            <Loading />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{m.staff.name}</th>
                  <th>{m.staff.roles}</th>
                  <th>{m.staff.passkeys}</th>
                  <th>{m.staff.status}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data?.map((person) => {
                  const self = person.id === me.id;
                  const allSites = person.roles.find((r) => r.site === null);
                  return (
                    <tr key={person.id}>
                      <td>
                        <p className="font-medium">
                          {person.name}{' '}
                          {self && <span className="text-muted">({m.staff.you})</span>}
                        </p>
                        <p dir="ltr" className="text-start text-muted">
                          {person.email}
                        </p>
                      </td>
                      <td>
                        {manages && !self ? (
                          <Select
                            aria-label={`${m.staff.changeRole} (${m.allSites})`}
                            value={allSites?.role.id ?? ''}
                            onChange={(e) => {
                              if (e.target.value)
                                setRole.mutate({ userId: person.id, roleId: e.target.value });
                            }}
                          >
                            {!allSites && (
                              <option value="">
                                {person.roles
                                  .map((r) => `${bi(r.role.name)} — ${siteName(r.site ?? '')}`)
                                  .join('، ') || m.none}
                              </option>
                            )}
                            {allSites && !choices.some((r) => r.id === allSites.role.id) && (
                              <option value={allSites.role.id}>{bi(allSites.role.name)}</option>
                            )}
                            {choices.map((r) => (
                              <option key={r.id} value={r.id}>
                                {bi(r.name)} — {m.allSites}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <ul>
                            {person.roles.map((r, i) => (
                              <li key={i}>
                                {bi(r.role.name)} —{' '}
                                {r.site === null ? m.allSites : siteName(r.site)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>{person.passkeys}</td>
                      <td>
                        <Badge tone={person.status === 'active' ? 'success' : 'danger'}>
                          {person.status === 'active' ? m.staff.active : m.staff.disabled}
                        </Badge>
                      </td>
                      <td className="text-end">
                        {manages && !self && (
                          <Button
                            size="sm"
                            variant={person.status === 'active' ? 'danger' : 'secondary'}
                            onClick={later(async () => {
                              const enable = person.status !== 'active';
                              if (
                                enable ||
                                (await confirmAction(
                                  format(m.staff.disableConfirm, { name: person.name }),
                                ))
                              ) {
                                toggle.mutate({ userId: person.id, enable });
                              }
                            })}
                          >
                            {person.status === 'active' ? m.staff.disable : m.staff.enable}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        <PendingInvitations path="/staff" />
      </div>
      {manages && (
        <InviteDialog
          open={inviting}
          onClose={() => setInviting(false)}
          path="/staff/invitations"
          roles={choices}
          help={m.staff.invitePlatformHelp}
        />
      )}
    </>
  );
}
