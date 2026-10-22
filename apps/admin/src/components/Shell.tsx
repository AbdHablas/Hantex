import { useQueryClient } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Globe,
  Languages,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
  useParams,
} from 'react-router';
import { api } from '../lib/api';
import { useBilingual, useI18n } from '../lib/i18n';
import {
  accountItems,
  buildNavigation,
  flatten,
  locate,
  type NavItem,
  type NavSection,
} from '../lib/navigation';
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

/* ------------------------------------ Preferences ------------------------------------ */

function stored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for this visit.
  }
}

/* ---------------------------------------- Items ---------------------------------------- */

/** The side facing the page from the sidebar: right in English, left in Arabic. */
function useInward() {
  return useI18n().dir === 'rtl' ? ('left' as const) : ('right' as const);
}

const itemClass = (active: boolean, collapsed: boolean) =>
  cn(
    'flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm transition-colors',
    collapsed && 'justify-center px-0',
    active
      ? 'bg-accent-soft font-medium text-accent-text'
      : 'text-muted hover:bg-surface-2 hover:text-text',
  );

function ItemIcon({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="flex shrink-0 [&>svg]:size-4.5">
      {children}
    </span>
  );
}

function NavLinkItem({
  item,
  collapsed,
  nested,
}: {
  item: NavItem;
  collapsed: boolean;
  nested?: boolean;
}) {
  const inward = useInward();
  // The active state is worked out here (not with NavLink's class function) so the link keeps
  // its classes when the tooltip wraps it.
  const active = useMatch({ path: item.to, end: item.end ?? false }) !== null;
  const link = (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(itemClass(active, collapsed), nested && 'h-8 ps-9')}
    >
      {!nested && <ItemIcon>{item.icon}</ItemIcon>}
      <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
    </Link>
  );
  return collapsed ? (
    <Tooltip content={item.label} side={inward}>
      {link}
    </Tooltip>
  ) : (
    link
  );
}

/** An item with sub-pages: expands in place, or opens a menu beside the collapsed rail. */
function NavGroupItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const inward = useInward();
  const location = useLocation();
  const navigate = useNavigate();
  const children = item.children ?? [];
  const active = children.some(
    (child) => location.pathname === child.to || location.pathname.startsWith(`${child.to}/`),
  );
  const [open, setOpen] = useState(active);
  const panelId = useId();
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (collapsed) {
    return (
      <DropdownMenu
        side={inward}
        align="start"
        label={item.label}
        trigger={
          <button type="button" aria-label={item.label} className={itemClass(active, true)}>
            <ItemIcon>{item.icon}</ItemIcon>
          </button>
        }
      >
        <MenuLabel>{item.label}</MenuLabel>
        {children.map((child) => (
          <MenuItem key={child.id} onSelect={() => void navigate(child.to)}>
            {child.icon}
            {child.label}
          </MenuItem>
        ))}
      </DropdownMenu>
    );
  }
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(itemClass(false, false), active && 'font-medium text-text')}
      >
        <ItemIcon>{item.icon}</ItemIcon>
        <span className="flex-1 truncate text-start">{item.label}</span>
        <ChevronDown
          aria-hidden
          className={cn('size-4 transition-transform', !open && '-rotate-90 rtl:rotate-90')}
        />
      </button>
      <div
        id={panelId}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="flex flex-col gap-0.5 overflow-hidden pt-0.5">
          {children.map((child) => (
            <NavLinkItem key={child.id} item={child} collapsed={false} nested />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A labelled group of items; its heading folds it away (remembered per section). */
function NavSectionBlock({
  section,
  collapsed,
  folded,
  onToggle,
}: {
  section: NavSection;
  collapsed: boolean;
  folded: boolean;
  onToggle: () => void;
}) {
  const headingId = useId();
  const panelId = useId();
  const items = section.items.map((item) =>
    item.children ? (
      <NavGroupItem key={item.id} item={item} collapsed={collapsed} />
    ) : (
      <NavLinkItem key={item.id} item={item} collapsed={collapsed} />
    ),
  );
  if (!section.label) return <div className="flex flex-col gap-0.5">{items}</div>;
  if (collapsed) {
    return (
      <div role="group" aria-label={section.label} className="flex flex-col gap-0.5">
        <span aria-hidden className="mx-2 mb-1 h-px bg-border" />
        {items}
      </div>
    );
  }
  return (
    <div role="group" aria-labelledby={headingId} className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={!folded}
        aria-controls={panelId}
        onClick={onToggle}
        className="group flex items-center gap-1 rounded-md px-2.5 py-1 text-start"
      >
        <span
          id={headingId}
          className="flex-1 truncate text-[0.7rem] font-semibold tracking-wider text-muted uppercase group-hover:text-text"
        >
          {section.label}
          {section.hint && (
            <span className="ms-1.5 font-normal tracking-normal normal-case">· {section.hint}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 text-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100',
            folded && '-rotate-90 opacity-100 rtl:rotate-90',
          )}
        />
      </button>
      <div
        id={panelId}
        inert={folded}
        className={cn(
          'grid transition-[grid-template-rows] duration-200',
          folded ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}
      >
        <div className="flex flex-col gap-0.5 overflow-hidden">{items}</div>
      </div>
    </div>
  );
}

/* ------------------------------------ Website switcher ------------------------------------ */

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

/**
 * Chooses the website the Website sections apply to. Switching keeps the current page when
 * the other website has it (e.g. Appearance → Appearance), otherwise opens its overview.
 */
function SiteSwitcher({ me, collapsed }: { me: Me; collapsed: boolean }) {
  const inward = useInward();
  const { m } = useI18n();
  const bi = useBilingual();
  const { siteKey } = useParams();
  const navigate = useNavigate();
  const sub = useMatch('/s/:siteKey/*')?.params['*'] ?? '';
  const current = me.sites.find((s) => s.key === siteKey);
  if (me.sites.length === 0) return null;
  const switchTo = (site: MySite) => {
    const target = `/s/${site.key}${sub ? `/${sub}` : ''}`;
    const available = flatten(
      buildNavigation(m, me, site).flatMap((section) => section.items),
    ).some((item) => item.to === target);
    void navigate(available ? target : `/s/${site.key}`);
  };
  return (
    <DropdownMenu
      align="start"
      side={collapsed ? inward : 'bottom'}
      label={m.nav.chooseSite}
      trigger={
        <button
          type="button"
          aria-label={
            collapsed
              ? current
                ? `${m.nav.currentSite}: ${bi(current.name)}`
                : m.nav.chooseSite
              : undefined
          }
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
                <span className="block text-[0.65rem] font-medium tracking-wider text-muted uppercase">
                  {m.nav.sectionWebsite}
                </span>
                <span className="block truncate text-sm font-medium">
                  {current ? bi(current.name) : m.nav.chooseSite}
                </span>
              </span>
              <ChevronsUpDown className="size-4 text-muted" aria-hidden />
            </>
          )}
        </button>
      }
    >
      <MenuLabel>{m.nav.sites}</MenuLabel>
      {me.sites.map((site) => (
        <MenuItem key={site.key} onSelect={() => switchTo(site)}>
          <SiteMark site={site} className="size-6 rounded-md text-xs" />
          <span className="flex-1 truncate">
            {bi(site.name)}
            {site.archived ? ` (${m.sites['archived'] ?? ''})` : ''}
          </span>
          {site.key === siteKey ? (
            <Check className="text-accent-text!" aria-label={m.nav.currentSite} />
          ) : (
            <Badge tone={modeTone(site.mode)}>{m.mode[site.mode] ?? site.mode}</Badge>
          )}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem onSelect={() => void navigate('/sites')}>
        <Building2 aria-hidden />
        {m.nav.manageWebsites}
      </MenuItem>
    </DropdownMenu>
  );
}

/* ---------------------------------- Account and preferences ---------------------------------- */

function UserMenu({ me, collapsed, signOut }: { me: Me; collapsed: boolean; signOut: () => void }) {
  const inward = useInward();
  const { m } = useI18n();
  const navigate = useNavigate();
  return (
    <DropdownMenu
      side={collapsed ? inward : 'top'}
      align={collapsed ? 'end' : 'start'}
      label={m.nav.userMenu}
      trigger={
        <button
          type="button"
          aria-label={collapsed ? `${m.nav.userMenu}: ${me.name}` : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 p-2 text-start transition hover:bg-surface-2',
            collapsed && 'justify-center border-transparent bg-transparent p-0',
          )}
        >
          <Avatar name={me.name || me.email} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="sr-only">{m.nav.userMenu}: </span>
                <span className="block truncate text-sm font-medium">{me.name}</span>
                <span className="block truncate text-xs text-muted" dir="ltr">
                  {me.email}
                </span>
              </span>
              <ChevronsUpDown className="size-4 text-muted" aria-hidden />
            </>
          )}
        </button>
      }
    >
      <div className="px-2.5 py-2">
        <p className="truncate font-medium">{me.name}</p>
        <p className="truncate text-xs text-muted" dir="ltr">
          {me.email}
        </p>
      </div>
      <MenuSeparator />
      {accountItems(m).map((item) => (
        <MenuItem key={item.id} onSelect={() => void navigate(item.to)}>
          {item.icon}
          {item.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem onSelect={signOut}>
        <LogOut aria-hidden />
        {m.auth.signOut}
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
      label={m.theme}
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
        aria-label={`${m.language} ${locale === 'ar' ? 'EN' : 'ع'}`}
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

/* ------------------------------------ Command palette ------------------------------------ */

/** Ctrl/⌘ + K: every page the person may open, every website, and preferences. */
function CommandPalette({
  open,
  onClose,
  me,
  sections,
  signOut,
}: {
  open: boolean;
  onClose: () => void;
  me: Me;
  sections: NavSection[];
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
  const pageGroups = [
    ...sections.map((section) => ({
      id: section.id,
      heading: section.label ?? m.nav.sectionWebsite,
      items: flatten(section.items),
    })),
    { id: 'account', heading: m.nav.account, items: accountItems(m) },
  ];
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
            {pageGroups.map((g) => (
              <Command.Group key={g.id} heading={g.heading} className={group}>
                {g.items.map((entry) => (
                  <Command.Item
                    key={entry.to}
                    value={`${g.heading} ${entry.label} ${entry.to}`}
                    keywords={entry.keywords ?? []}
                    onSelect={() => run(() => void navigate(entry.to))}
                    className={item}
                  >
                    {entry.icon}
                    {entry.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
            {me.sites.length > 1 && (
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

/* ---------------------------------------- Sidebar ---------------------------------------- */

/** The sidebar's contents, shared by the desktop sidebar and the mobile drawer. */
function SidebarContent({
  me,
  sections,
  collapsed,
  signOut,
}: {
  me: Me;
  sections: NavSection[];
  collapsed: boolean;
  signOut: () => void;
}) {
  const { m } = useI18n();
  const location = useLocation();
  const [folded, setFolded] = useState<string[]>(() => stored('hantex.nav.folded', []));
  const here = locate(sections, accountItems(m), location.pathname);
  const siteSections = sections.filter((s) => s.scope === 'site');
  const platformSections = sections.filter((s) => s.scope === 'platform');
  const toggle = (id: string) =>
    setFolded((current) => {
      const next = current.includes(id) ? current.filter((f) => f !== id) : [...current, id];
      store('hantex.nav.folded', next);
      return next;
    });
  const block = (section: NavSection) => (
    <NavSectionBlock
      key={section.id}
      section={section}
      collapsed={collapsed}
      // The section holding the current page always stays open.
      folded={folded.includes(section.id) && here?.section?.id !== section.id}
      onToggle={() => toggle(section.id)}
    />
  );
  return (
    <div className="flex h-full flex-col gap-4">
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
      <nav
        aria-label={m.nav.mainNavigation}
        className="-mx-1 flex flex-1 flex-col gap-4 overflow-y-auto px-1"
      >
        {me.sites.length > 0 && (
          <div className="flex flex-col gap-3">
            <SiteSwitcher me={me} collapsed={collapsed} />
            {siteSections.length > 0 && (
              <div className="flex flex-col gap-4">{siteSections.map(block)}</div>
            )}
          </div>
        )}
        {platformSections.length > 0 && (
          <div className="mt-auto flex flex-col gap-4 border-t border-border pt-4">
            {platformSections.map(block)}
          </div>
        )}
      </nav>
      <UserMenu me={me} collapsed={collapsed} signOut={signOut} />
    </div>
  );
}

/* ----------------------------------------- Shell ----------------------------------------- */

const prefersRail = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches;

/** Signed-in layout: sidebar, top bar with breadcrumbs and search, and the page. */
export function Shell() {
  const { data: me, isPending } = useMe();
  const { m, dir, locale } = useI18n();
  const bi = useBilingual();
  const { siteKey } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Tablets start with the icon rail; a choice made with the toggle is remembered.
  const [collapsed, setCollapsed] = useState(() => stored('hantex.sidebar', prefersRail()));
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

  // The drawer closes when the page changes.
  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal?.();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  const site = me?.sites.find((s) => s.key === siteKey);
  const sections = useMemo(() => (me ? buildNavigation(m, me, site) : []), [m, me, site]);

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
  const toggleRail = () =>
    setCollapsed((c) => {
      store('hantex.sidebar', !c);
      return !c;
    });

  const here = locate(sections, accountItems(m), location.pathname);
  const crumbs = [
    here?.section?.scope === 'platform' ? m.nav.sectionAdmin : site ? bi(site.name) : null,
    here?.section?.scope === 'site' ? here.section.label : null,
  ].filter((c): c is string => Boolean(c));
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
            sections={sections}
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
            <SidebarContent
              me={me}
              sections={sections}
              collapsed={false}
              signOut={() => void signOut()}
            />
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
                onClick={toggleRail}
              >
                {collapsed ? (
                  <PanelLeftOpen aria-hidden className="rtl:-scale-x-100" />
                ) : (
                  <PanelLeftClose aria-hidden className="rtl:-scale-x-100" />
                )}
              </IconButton>
              <nav aria-label={m.nav.breadcrumb} className="hidden min-w-0 sm:block">
                <ol className="flex items-center gap-1.5 text-sm text-muted">
                  {crumbs.map((crumb) => (
                    <li key={crumb} className="flex items-center gap-1.5">
                      <span className="truncate">{crumb}</span>
                      <ChevronRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
                    </li>
                  ))}
                  {here && (
                    <li aria-current="page" className="truncate font-medium text-text">
                      {here.item.label}
                    </li>
                  )}
                </ol>
              </nav>
              {site && here?.section?.scope === 'site' && (
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
                  className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 text-sm text-muted transition hover:border-muted sm:w-56 lg:w-64"
                  aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
                >
                  <Search className="size-4" aria-hidden />
                  <span className="sr-only flex-1 text-start sm:not-sr-only">{m.nav.search}</span>
                  <span aria-hidden className="hidden sm:inline">
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
          sections={sections}
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
