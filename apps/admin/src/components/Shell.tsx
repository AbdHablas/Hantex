import type { Permission } from '@hantex/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  Building2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  Globe,
  History,
  Languages,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { api } from '../lib/api';
import { useBilingual, useI18n } from '../lib/i18n';
import { meQueryKey, useMe, type Me, type MySite } from '../lib/session';
import { useTheme } from '../lib/theme';
import {
  Avatar,
  Badge,
  ConfirmHost,
  DropdownMenu,
  IconButton,
  Kbd,
  Loading,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  Toaster,
  Tooltip,
  TooltipProvider,
  cn,
} from './ui';

interface NavEntry {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

/** The pages this person may open: the current site's, then the platform's. */
function useNavigation(me: Me | undefined, site: MySite | undefined) {
  const { m } = useI18n();
  const siteCan = (p: Permission) => site?.permissions.includes(p) === true;
  const platformCan = (p: Permission) => me?.permissions.includes(p) === true;
  const managesStaffSomewhere =
    me?.sites.some((s) => s.permissions.includes('staff.view')) === true;
  const base = site ? `/s/${site.key}` : '';
  const siteEntries: NavEntry[] = site
    ? [
        { to: base, label: m.nav.overview, icon: <LayoutDashboard />, end: true },
        ...(siteCan('comingSoon.view')
          ? [{ to: `${base}/coming-soon`, label: m.nav.comingSoon, icon: <FileText /> }]
          : []),
        ...(siteCan('settings.view')
          ? [{ to: `${base}/site-settings`, label: m.nav.settings, icon: <Settings2 /> }]
          : []),
        ...(siteCan('appearance.edit')
          ? [{ to: `${base}/appearance`, label: m.nav.appearance, icon: <Palette /> }]
          : []),
        ...(siteCan('subscribers.view')
          ? [{ to: `${base}/subscribers`, label: m.nav.subscribers, icon: <Mail /> }]
          : []),
        ...(siteCan('staff.view')
          ? [{ to: `${base}/staff`, label: m.nav.staff, icon: <Users /> }]
          : []),
        ...(siteCan('audit.view')
          ? [{ to: `${base}/audit`, label: m.nav.audit, icon: <History /> }]
          : []),
        { to: `${base}/settings`, label: m.nav.siteSettings, icon: <Globe /> },
      ]
    : [];
  const platformEntries: NavEntry[] = [
    { to: '/sites', label: m.nav.sites, icon: <Building2 /> },
    ...(platformCan('staff.view')
      ? [{ to: '/staff', label: m.nav.allStaff, icon: <Users /> }]
      : []),
    ...(managesStaffSomewhere || platformCan('roles.manage')
      ? [{ to: '/roles', label: m.nav.roles, icon: <ShieldCheck /> }]
      : []),
    ...(platformCan('audit.view')
      ? [{ to: '/audit', label: m.nav.fullAudit, icon: <ScrollText /> }]
      : []),
    { to: '/account', label: m.nav.account, icon: <UserRound /> },
  ];
  return { siteEntries, platformEntries };
}

function NavItem({ entry, collapsed }: { entry: NavEntry; collapsed: boolean }) {
  const link = (
    <NavLink
      to={entry.to}
      end={entry.end ?? false}
      className={({ isActive }) =>
        cn(
          'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-accent-soft font-medium text-accent-text'
            : 'text-muted hover:bg-surface-2 hover:text-text',
        )
      }
    >
      {() => (
        <>
          <span aria-hidden className="[&>svg]:size-4.5">
            {entry.icon}
          </span>
          <span className={cn('truncate', collapsed && 'sr-only')}>{entry.label}</span>
        </>
      )}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip content={entry.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function NavSection({
  title,
  entries,
  collapsed,
}: {
  title: string;
  entries: NavEntry[];
  collapsed: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p
        className={cn(
          'mb-1 px-2.5 text-[0.7rem] font-semibold tracking-wider text-muted uppercase',
          collapsed && 'sr-only',
        )}
      >
        {title}
      </p>
      {entries.map((entry) => (
        <NavItem key={entry.to} entry={entry} collapsed={collapsed} />
      ))}
    </div>
  );
}

const modeTone = (mode: string) =>
  mode === 'live' ? 'success' : mode === 'maintenance' ? 'danger' : 'warning';

function SiteMark({ site, className }: { site: MySite; className?: string }) {
  const bi = useBilingual();
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-text text-sm font-semibold text-accent-contrast',
        className,
      )}
    >
      {bi(site.name).slice(0, 1).toUpperCase()}
    </span>
  );
}

/** The website switcher: a menu of the person's websites with their mode. */
function SiteSwitcher({ me, collapsed }: { me: Me; collapsed: boolean }) {
  const { m } = useI18n();
  const bi = useBilingual();
  const { siteKey } = useParams();
  const navigate = useNavigate();
  const current = me.sites.find((s) => s.key === siteKey);
  if (me.sites.length === 0) return null;
  return (
    <DropdownMenu
      align="start"
      trigger={
        <button
          type="button"
          aria-label={m.nav.chooseSite}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-2 text-start shadow-sm transition hover:bg-surface-2',
            collapsed && 'justify-center border-transparent p-1 shadow-none',
          )}
        >
          {current ? (
            <SiteMark site={current} />
          ) : (
            <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-muted">
              <Globe className="size-4" aria-hidden />
            </span>
          )}
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {current ? bi(current.name) : m.nav.chooseSite}
                </span>
                {current && (
                  <span className="block truncate text-xs text-muted">
                    {m.mode[current.mode] ?? current.mode}
                  </span>
                )}
              </span>
              <ChevronsUpDown className="size-4 text-muted" aria-hidden />
            </>
          )}
        </button>
      }
    >
      <MenuLabel>{m.nav.sites}</MenuLabel>
      {me.sites.map((site) => (
        <MenuItem key={site.key} onSelect={() => void navigate(`/s/${site.key}`)}>
          <SiteMark site={site} className="size-6 rounded-md text-xs" />
          <span className="flex-1 truncate">
            {bi(site.name)}
            {site.archived ? ` (${m.sites['archived'] ?? ''})` : ''}
          </span>
          {site.key === siteKey ? (
            <Check className="text-accent-text!" aria-hidden />
          ) : (
            <Badge tone={modeTone(site.mode)}>{m.mode[site.mode] ?? site.mode}</Badge>
          )}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem onSelect={() => void navigate('/sites')}>
        <Building2 aria-hidden />
        {m.nav.allWebsites}
      </MenuItem>
    </DropdownMenu>
  );
}

function ThemeMenu() {
  const { m } = useI18n();
  const { choice, setChoice } = useTheme();
  const icon = choice === 'dark' ? <Moon /> : choice === 'light' ? <Sun /> : <Monitor />;
  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          aria-label={m.theme}
          className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-text [&>svg]:size-4"
        >
          {icon}
        </button>
      }
    >
      <MenuLabel>{m.theme}</MenuLabel>
      <MenuRadioGroup value={choice} onValueChange={(v) => setChoice(v as typeof choice)}>
        <MenuRadioItem value="system">{m.themeSystem}</MenuRadioItem>
        <MenuRadioItem value="light">{m.themeLight}</MenuRadioItem>
        <MenuRadioItem value="dark">{m.themeDark}</MenuRadioItem>
      </MenuRadioGroup>
    </DropdownMenu>
  );
}

function LanguageButton() {
  const { m, locale, setLocale } = useI18n();
  return (
    <Tooltip content={locale === 'ar' ? m.english : m.arabic}>
      <button
        type="button"
        onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
        aria-label={m.language}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted transition hover:bg-surface-2 hover:text-text"
      >
        <Languages className="size-4" aria-hidden />
        <span lang={locale === 'ar' ? 'en' : 'ar'} className="hidden sm:inline">
          {locale === 'ar' ? 'EN' : 'ع'}
        </span>
      </button>
    </Tooltip>
  );
}

/** ⌘K / Ctrl+K: jump to any page or website, or change preferences. */
function CommandPalette({
  open,
  onClose,
  me,
  entries,
  signOut,
}: {
  open: boolean;
  onClose: () => void;
  me: Me;
  entries: NavEntry[];
  signOut: () => void;
}) {
  const { m, locale, setLocale } = useI18n();
  const bi = useBilingual();
  const { setChoice } = useTheme();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const run = (action: () => void) => {
    onClose();
    action();
  };
  const item =
    'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-text data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-text [&_svg]:size-4 [&_svg]:text-muted';
  const group =
    'mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted';
  return (
    <dialog
      ref={ref}
      aria-label={m.nav.search}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text shadow-lg"
    >
      {open && (
        <Command label={m.nav.search} loop>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 text-muted" aria-hidden />
            <Command.Input
              autoFocus
              placeholder={m.nav.searchPlaceholder}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
              {m.nav.noResults}
            </Command.Empty>
            <Command.Group heading={m.nav.pages} className={group}>
              {entries.map((entry) => (
                <Command.Item
                  key={entry.to}
                  value={`${entry.label} ${entry.to}`}
                  onSelect={() => run(() => void navigate(entry.to))}
                  className={item}
                >
                  {entry.icon}
                  {entry.label}
                </Command.Item>
              ))}
            </Command.Group>
            {me.sites.length > 0 && (
              <Command.Group heading={m.nav.sites} className={group}>
                {me.sites.map((site) => (
                  <Command.Item
                    key={site.key}
                    value={`${site.name.ar} ${site.name.en} ${site.key}`}
                    onSelect={() => run(() => void navigate(`/s/${site.key}`))}
                    className={item}
                  >
                    <SiteMark site={site} className="size-5 rounded text-[0.65rem]" />
                    {bi(site.name)}
                    <span className="ms-auto">
                      <Badge tone={modeTone(site.mode)}>{m.mode[site.mode] ?? site.mode}</Badge>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Group heading={m.nav.actions} className={group}>
              <Command.Item
                value={`${m.language} ${m.english} ${m.arabic}`}
                onSelect={() => run(() => setLocale(locale === 'ar' ? 'en' : 'ar'))}
                className={item}
              >
                <Languages />
                {locale === 'ar' ? m.english : m.arabic}
              </Command.Item>
              <Command.Item onSelect={() => run(() => setChoice('light'))} className={item}>
                <Sun />
                {m.themeLight}
              </Command.Item>
              <Command.Item onSelect={() => run(() => setChoice('dark'))} className={item}>
                <Moon />
                {m.themeDark}
              </Command.Item>
              <Command.Item onSelect={() => run(() => setChoice('system'))} className={item}>
                <Monitor />
                {m.themeSystem}
              </Command.Item>
              <Command.Item onSelect={() => run(signOut)} className={item}>
                <LogOut />
                {m.auth.signOut}
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      )}
    </dialog>
  );
}

/** The sidebar's contents, shared by the desktop sidebar and the mobile drawer. */
function SidebarContent({
  me,
  site,
  collapsed,
  signOut,
}: {
  me: Me;
  site: MySite | undefined;
  collapsed: boolean;
  signOut: () => void;
}) {
  const { m } = useI18n();
  const bi = useBilingual();
  const { siteEntries, platformEntries } = useNavigation(me ?? undefined, site);
  return (
    <div className="flex h-full flex-col gap-5">
      <NavLink
        to="/"
        className={cn('flex items-center gap-2.5 px-1', collapsed && 'justify-center px-0')}
      >
        <img src="/favicon.svg" alt="" className="size-8" />
        {!collapsed && (
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Hantex Ultra</span>
            <span className="block text-xs text-muted">{m.nav.dashboard}</span>
          </span>
        )}
      </NavLink>
      <SiteSwitcher me={me} collapsed={collapsed} />
      <nav aria-label={m.appName} className="-mx-1 flex flex-1 flex-col gap-5 overflow-y-auto px-1">
        {site && <NavSection title={bi(site.name)} entries={siteEntries} collapsed={collapsed} />}
        <NavSection title={m.nav.platform} entries={platformEntries} collapsed={collapsed} />
      </nav>
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 p-2',
          collapsed && 'flex-col border-transparent bg-transparent p-0',
        )}
      >
        <Avatar name={me.name || me.email} />
        {!collapsed && (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium">{me.name}</span>
            <span className="block truncate text-xs text-muted" dir="ltr">
              {me.email}
            </span>
          </span>
        )}
        <IconButton label={m.auth.signOut} onClick={signOut}>
          <LogOut aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}

function readCollapsed() {
  try {
    return localStorage.getItem('hantex.sidebar') === 'collapsed';
  } catch {
    return false;
  }
}

/** Signed-in layout: sidebar, top bar with breadcrumbs and search, and the page. */
export function Shell() {
  const { data: me, isPending } = useMe();
  const { m, dir, locale } = useI18n();
  const bi = useBilingual();
  const { siteKey } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('hantex.sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      // Storage may be unavailable (private mode); the choice then lasts for this visit.
    }
  }, [collapsed]);

  // The drawer closes when the page changes.
  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal?.();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  const site = me?.sites.find((s) => s.key === siteKey);
  const { siteEntries, platformEntries } = useNavigation(me ?? undefined, site);

  if (isPending) {
    return (
      <div className="p-8">
        <Loading />
      </div>
    );
  }
  if (!me) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;

  const signOut = async () => {
    await api('/auth/sign-out', { method: 'POST', body: {} }).catch(() => undefined);
    queryClient.clear();
    void navigate('/sign-in', { replace: true });
  };

  const entries = [...siteEntries, ...platformEntries];
  const currentPage = [...entries]
    .sort((a, b) => b.to.length - a.to.length)
    .find((e) => location.pathname === e.to || location.pathname.startsWith(`${e.to}/`));
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-dvh md:flex" dir={dir}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2"
        >
          {m.skipToContent}
        </a>

        <aside
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 border-e border-border bg-surface px-3 py-4 transition-[width] duration-200 md:block',
            collapsed ? 'w-[4.25rem]' : 'w-64',
          )}
        >
          <SidebarContent
            me={me}
            site={site}
            collapsed={collapsed}
            signOut={() => void signOut()}
          />
        </aside>

        <dialog
          ref={drawer}
          data-sheet
          aria-label={m.nav.menu}
          onClose={() => setDrawerOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setDrawerOpen(false);
          }}
          className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-e border-border bg-surface p-4 text-text shadow-lg md:hidden"
        >
          {drawerOpen && (
            <SidebarContent me={me} site={site} collapsed={false} signOut={() => void signOut()} />
          )}
        </dialog>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-border bg-surface/80 backdrop-blur-md">
            <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
              <IconButton
                label={m.nav.menu}
                className="md:hidden"
                onClick={() => setDrawerOpen(true)}
              >
                <MenuIcon aria-hidden />
              </IconButton>
              <IconButton
                label={collapsed ? m.nav.expand : m.nav.collapse}
                className="hidden md:inline-flex"
                onClick={() => setCollapsed((c) => !c)}
              >
                {collapsed ? (
                  <PanelLeftOpen aria-hidden className="rtl:-scale-x-100" />
                ) : (
                  <PanelLeftClose aria-hidden className="rtl:-scale-x-100" />
                )}
              </IconButton>
              <nav aria-label={m.nav.breadcrumb} className="hidden min-w-0 sm:block">
                <ol className="flex items-center gap-1.5 text-sm text-muted">
                  <li className="truncate">{site ? bi(site.name) : m.nav.platform}</li>
                  {currentPage && (
                    <>
                      <li aria-hidden>
                        <ChevronRight className="size-3.5 rtl:-scale-x-100" />
                      </li>
                      <li aria-current="page" className="truncate font-medium text-text">
                        {currentPage.label}
                      </li>
                    </>
                  )}
                </ol>
              </nav>
              {site && (
                <span className="hidden lg:inline-flex">
                  <Badge tone={modeTone(site.mode)} dot>
                    {m.mode[site.mode] ?? site.mode}
                  </Badge>
                </span>
              )}
              <div className="ms-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 text-sm text-muted transition hover:border-muted sm:w-64"
                  aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
                >
                  <Search className="size-4" aria-hidden />
                  <span className="hidden flex-1 text-start sm:inline">{m.nav.search}</span>
                  <span className="hidden sm:inline">
                    <Kbd>{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
                  </span>
                </button>
                <LanguageButton />
                <ThemeMenu />
              </div>
            </div>
          </header>
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl px-4 py-6 outline-none lg:px-8 lg:py-8"
            lang={locale}
          >
            <Outlet />
          </main>
        </div>

        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          me={me}
          entries={entries}
          signOut={() => void signOut()}
        />
        <ConfirmHost />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

/** Keeps the cached profile in sync after actions that change access. */
export function useRefreshMe() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: meQueryKey });
}
