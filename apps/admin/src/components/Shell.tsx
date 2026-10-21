import type { Permission } from '@hantex/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  FileText,
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  Monitor,
  Moon,
  ScrollText,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { api } from '../lib/api';
import { useBilingual, useI18n } from '../lib/i18n';
import { meQueryKey, useMe, type Me } from '../lib/session';
import { useTheme } from '../lib/theme';
import { Badge, Loading, Select, cn } from './ui';

function NavItem({
  to,
  icon,
  children,
  end,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end ?? false}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
          isActive ? 'bg-bg font-medium text-accent-text' : 'text-text hover:bg-bg',
        )
      }
    >
      <span aria-hidden className="[&>svg]:size-4">
        {icon}
      </span>
      {children}
    </NavLink>
  );
}

function SiteSwitcher({ me }: { me: Me }) {
  const { m } = useI18n();
  const bi = useBilingual();
  const { siteKey } = useParams();
  const navigate = useNavigate();
  if (me.sites.length === 0) return null;
  return (
    <label className="flex min-w-48 flex-col gap-1">
      <span className="sr-only">{m.nav.chooseSite}</span>
      <Select
        value={siteKey ?? ''}
        onChange={(event) => {
          if (event.target.value) void navigate(`/s/${event.target.value}`);
        }}
      >
        {!siteKey && <option value="">{m.nav.chooseSite}</option>}
        {me.sites.map((site) => (
          <option key={site.key} value={site.key}>
            {bi(site.name)}
            {site.archived ? ` (${m.sites['archived'] ?? ''})` : ''}
          </option>
        ))}
      </Select>
    </label>
  );
}

function Preferences() {
  const { m, locale, setLocale } = useI18n();
  const { choice, setChoice } = useTheme();
  const themes = [
    { value: 'system', label: m.themeSystem, icon: <Monitor /> },
    { value: 'light', label: m.themeLight, icon: <Sun /> },
    { value: 'dark', label: m.themeDark, icon: <Moon /> },
  ] as const;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
        className="h-9 rounded-lg px-3 text-sm hover:bg-bg"
        lang={locale === 'ar' ? 'en' : 'ar'}
        aria-label={m.language}
      >
        {locale === 'ar' ? m.english : m.arabic}
      </button>
      <div role="radiogroup" aria-label={m.theme} className="flex rounded-lg border border-border">
        {themes.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={choice === t.value}
            aria-label={t.label}
            title={t.label}
            onClick={() => setChoice(t.value)}
            className={cn(
              'p-2 [&>svg]:size-4',
              choice === t.value ? 'text-accent-text' : 'text-muted',
            )}
          >
            {t.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Signed-in layout: header, site switcher and navigation for the current site and platform. */
export function Shell() {
  const { data: me, isPending } = useMe();
  const { m, dir } = useI18n();
  const bi = useBilingual();
  const { siteKey } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  if (isPending) {
    return (
      <div className="p-8">
        <Loading />
      </div>
    );
  }
  if (!me) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;

  const site = me.sites.find((s) => s.key === siteKey);
  const siteCan = (p: Permission) => site?.permissions.includes(p) === true;
  const platformCan = (p: Permission) => me.permissions.includes(p);
  const managesStaffSomewhere = me.sites.some((s) => s.permissions.includes('staff.view'));

  const signOut = async () => {
    await api('/auth/sign-out', { method: 'POST', body: {} }).catch(() => undefined);
    queryClient.clear();
    void navigate('/sign-in', { replace: true });
  };

  return (
    <div className="min-h-dvh" dir={dir}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-surface focus:p-2"
      >
        {m.skipToContent}
      </a>
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" className="size-8" />
            <span>Hantex Ultra</span>
          </NavLink>
          <SiteSwitcher me={me} />
          {site && (
            <Badge tone={site.mode === 'live' ? 'success' : 'warning'}>
              {m.mode[site.mode] ?? site.mode}
            </Badge>
          )}
          <div className="ms-auto flex items-center gap-2">
            <Preferences />
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm hover:bg-bg"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">{m.auth.signOut}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[14rem_1fr]">
        <nav aria-label={m.appName} className="flex flex-col gap-4">
          {site && (
            <div className="flex flex-col gap-1">
              <p className="px-3 text-xs font-medium text-muted">{bi(site.name)}</p>
              <NavItem to={`/s/${site.key}`} end icon={<LayoutDashboard />}>
                {m.nav.overview}
              </NavItem>
              {siteCan('comingSoon.view') && (
                <NavItem to={`/s/${site.key}/coming-soon`} icon={<FileText />}>
                  {m.nav.comingSoon}
                </NavItem>
              )}
              {siteCan('subscribers.view') && (
                <NavItem to={`/s/${site.key}/subscribers`} icon={<Mail />}>
                  {m.nav.subscribers}
                </NavItem>
              )}
              {siteCan('staff.view') && (
                <NavItem to={`/s/${site.key}/staff`} icon={<Users />}>
                  {m.nav.staff}
                </NavItem>
              )}
              {siteCan('audit.view') && (
                <NavItem to={`/s/${site.key}/audit`} icon={<History />}>
                  {m.nav.audit}
                </NavItem>
              )}
              <NavItem to={`/s/${site.key}/settings`} icon={<Globe />}>
                {m.nav.siteSettings}
              </NavItem>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <p className="px-3 text-xs font-medium text-muted">{m.nav.platform}</p>
            <NavItem to="/sites" icon={<Building2 />}>
              {m.nav.sites}
            </NavItem>
            {platformCan('staff.view') && (
              <NavItem to="/staff" icon={<Users />}>
                {m.nav.allStaff}
              </NavItem>
            )}
            {(managesStaffSomewhere || platformCan('roles.manage')) && (
              <NavItem to="/roles" icon={<ShieldCheck />}>
                {m.nav.roles}
              </NavItem>
            )}
            {platformCan('audit.view') && (
              <NavItem to="/audit" icon={<ScrollText />}>
                {m.nav.fullAudit}
              </NavItem>
            )}
            <NavItem to="/account" icon={<UserRound />}>
              {m.nav.account}
            </NavItem>
          </div>
        </nav>
        <main id="main" tabIndex={-1} className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Keeps the cached profile in sync after actions that change access. */
export function useRefreshMe() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: meQueryKey });
}
