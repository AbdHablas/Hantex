import type { Permission } from '@hantex/shared';
import {
  Building2,
  FileText,
  History,
  LayoutDashboard,
  Mail,
  Palette,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Messages } from './messages';
import type { Me, MySite } from './session';

/**
 * The dashboard's information architecture, in one place. The sidebar, the mobile menu, the
 * breadcrumbs and the command palette are all built from it, so they never disagree.
 *
 * - Website sections apply to the website chosen in the switcher; Administration applies to
 *   all websites. Each item shows only when the person's role allows the page (the server
 *   checks again on every request).
 * - To add a module, add an item to the section it belongs to. An item may have `children`
 *   (one level only); a section with no visible items is hidden.
 */

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: ReactNode;
  /** Match the address exactly (for a section's home page). */
  end?: boolean;
  /** Extra words the command palette matches. */
  keywords?: string[];
  children?: NavItem[];
}

export interface NavSection {
  id: string;
  /** Hidden for the first website section, whose title is the website switcher itself. */
  label: string | null;
  hint?: string;
  scope: 'site' | 'platform';
  items: NavItem[];
}

interface Rule {
  site?: Permission;
  platform?: Permission;
  /** Visible when any of these holds. */
  any?: (ctx: { me: Me; site: MySite | undefined }) => boolean;
}

type Entry = Omit<NavItem, 'children'> & { rule?: Rule; children?: Entry[] };

function allowed(rule: Rule | undefined, me: Me, site: MySite | undefined) {
  if (!rule) return true;
  if (rule.site && site?.permissions.includes(rule.site) !== true) return false;
  if (rule.platform && !me.permissions.includes(rule.platform)) return false;
  if (rule.any && !rule.any({ me, site })) return false;
  return true;
}

function visible(entries: Entry[], me: Me, site: MySite | undefined): NavItem[] {
  return entries
    .filter((entry) => allowed(entry.rule, me, site))
    .map(({ rule: _rule, children, ...item }) => {
      const shown = children ? visible(children, me, site) : undefined;
      return shown && shown.length > 0 ? { ...item, children: shown } : item;
    });
}

export function buildNavigation(m: Messages, me: Me, site: MySite | undefined): NavSection[] {
  const n = m.nav;
  const sections: { section: Omit<NavSection, 'items'>; entries: Entry[] }[] = [];

  if (site) {
    const base = `/s/${site.key}`;
    sections.push(
      {
        section: { id: 'website', label: null, scope: 'site' },
        entries: [
          { id: 'overview', label: n.overview, to: base, end: true, icon: <LayoutDashboard /> },
        ],
      },
      {
        section: { id: 'content', label: n.sectionContent, scope: 'site' },
        entries: [
          {
            id: 'coming-soon',
            label: n.comingSoon,
            to: `${base}/coming-soon`,
            icon: <FileText />,
            keywords: ['launch', 'countdown', 'faq', 'categories', 'إطلاق'],
            rule: { site: 'comingSoon.view' },
          },
          {
            id: 'appearance',
            label: n.appearance,
            to: `${base}/appearance`,
            icon: <Palette />,
            keywords: ['theme', 'colours', 'colors', 'fonts', 'logo', 'ألوان', 'خطوط'],
            rule: { site: 'appearance.edit' },
          },
        ],
      },
      {
        section: { id: 'audience', label: n.sectionAudience, scope: 'site' },
        entries: [
          {
            id: 'subscribers',
            label: n.subscribers,
            to: `${base}/subscribers`,
            icon: <Mail />,
            keywords: ['subscribers', 'export', 'whatsapp', 'email', 'مشتركون'],
            rule: { site: 'subscribers.view' },
          },
        ],
      },
      {
        section: { id: 'site-settings', label: n.sectionSettings, scope: 'site' },
        entries: [
          {
            id: 'general',
            label: n.general,
            to: `${base}/settings`,
            icon: <SlidersHorizontal />,
            keywords: ['domains', 'mode', 'live', 'maintenance', 'archive', 'نطاقات', 'وضع'],
          },
          {
            id: 'seo-contact',
            label: n.seoContact,
            to: `${base}/site-settings`,
            icon: <Search />,
            keywords: ['seo', 'contact', 'social', 'privacy', 'phone', 'خصوصية', 'تواصل'],
            rule: { site: 'settings.view' },
          },
          {
            id: 'team',
            label: n.team,
            to: `${base}/staff`,
            icon: <UsersRound />,
            keywords: ['staff', 'invite', 'roles', 'دعوة', 'موظفون'],
            rule: { site: 'staff.view' },
          },
          {
            id: 'activity',
            label: n.activity,
            to: `${base}/audit`,
            icon: <History />,
            keywords: ['audit', 'history', 'تدقيق'],
            rule: { site: 'audit.view' },
          },
        ],
      },
    );
  }

  sections.push({
    section: { id: 'admin', label: n.sectionAdmin, hint: n.sectionAdminHelp, scope: 'platform' },
    entries: [
      { id: 'sites', label: n.sites, to: '/sites', icon: <Building2 />, keywords: ['new website'] },
      {
        id: 'people',
        label: n.people,
        to: '/staff',
        icon: <Users />,
        keywords: ['staff', 'disable', 'invite', 'موظفون'],
        rule: { platform: 'staff.view' },
      },
      {
        id: 'roles',
        label: n.roles,
        to: '/roles',
        icon: <ShieldCheck />,
        keywords: ['permissions', 'صلاحيات'],
        rule: {
          any: ({ me }) =>
            me.permissions.includes('roles.manage') ||
            me.sites.some((s) => s.permissions.includes('staff.view')),
        },
      },
      {
        id: 'audit',
        label: n.auditLog,
        to: '/audit',
        icon: <ScrollText />,
        keywords: ['history', 'activity'],
        rule: { platform: 'audit.view' },
      },
    ],
  });

  return sections
    .map(({ section, entries }) => ({ ...section, items: visible(entries, me, site) }))
    .filter((section) => section.items.length > 0);
}

/** Personal pages, shown in the account menu rather than the sidebar's sections. */
export function accountItems(m: Messages): NavItem[] {
  return [{ id: 'account', label: m.nav.account, to: '/account', icon: <UserRound /> }];
}

/** Every item, children included, in display order. */
export function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

/** The section and item for an address: the longest matching link wins. */
export function locate(sections: NavSection[], extra: NavItem[], pathname: string) {
  let best: { section: NavSection | null; item: NavItem } | null = null;
  const consider = (section: NavSection | null, item: NavItem) => {
    const matches = item.end
      ? pathname === item.to
      : pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (matches && (!best || item.to.length > best.item.to.length)) best = { section, item };
  };
  for (const section of sections) flatten(section.items).forEach((i) => consider(section, i));
  extra.forEach((i) => consider(null, i));
  return best as { section: NavSection | null; item: NavItem } | null;
}
