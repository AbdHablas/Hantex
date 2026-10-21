import { PLATFORM_PERMISSIONS, permissionsOf, type Permission } from '@hantex/shared';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages';
import { accountItems, buildNavigation, flatten, locate } from './navigation';
import type { Me, MySite } from './session';

const m = MESSAGES.en;

const siteFor = (roleId: string): MySite => ({
  key: 'hantex-ultra',
  name: { ar: 'هانتكس', en: 'Hantex Ultra' },
  mode: 'coming-soon',
  archived: false,
  role: { id: roleId, name: { ar: roleId, en: roleId } },
  permissions: [...permissionsOf(roleId)].filter((p) => !PLATFORM_PERMISSIONS.includes(p)),
});

/** A person with one role: on all websites (platform permissions too) or on one website. */
const person = (roleId: string, allSites: boolean): Me => ({
  id: 'u',
  name: 'Test',
  email: 'test@example.test',
  locale: 'en',
  allSites,
  permissions: allSites ? [...permissionsOf(roleId)] : ([] as Permission[]),
  sites: [siteFor(roleId)],
  passkeys: 1,
  recoveryCodesLeft: 10,
});

const ids = (me: Me) =>
  buildNavigation(m, me, me.sites[0]).flatMap((s) => flatten(s.items).map((i) => i.id));

describe('dashboard navigation', () => {
  it('gives an Owner every page, grouped into website sections and Administration', () => {
    const sections = buildNavigation(m, person('owner', true), siteFor('owner'));
    expect(sections.map((s) => s.id)).toEqual([
      'website',
      'content',
      'audience',
      'site-settings',
      'admin',
    ]);
    expect(ids(person('owner', true))).toEqual([
      'overview',
      'coming-soon',
      'appearance',
      'subscribers',
      'general',
      'seo-contact',
      'team',
      'activity',
      'sites',
      'people',
      'roles',
      'audit',
    ]);
  });

  it('never lists a page twice and gives every page its own name', () => {
    const items = buildNavigation(m, person('owner', true), siteFor('owner')).flatMap((s) =>
      flatten(s.items),
    );
    const all = [...items, ...accountItems(m)];
    expect(new Set(all.map((i) => i.to)).size).toBe(all.length);
    for (const locale of ['ar', 'en'] as const) {
      const labels = [
        ...buildNavigation(MESSAGES[locale], person('owner', true), siteFor('owner')).flatMap((s) =>
          flatten(s.items),
        ),
        ...accountItems(MESSAGES[locale]),
      ].map((i) => i.label);
      expect(new Set(labels).size, locale).toBe(labels.length);
    }
  });

  it('shows only what a role allows, and hides sections left empty', () => {
    const viewer = ids(person('viewer', false));
    expect(viewer).not.toContain('team');
    expect(viewer).not.toContain('people');
    expect(viewer).not.toContain('audit');
    const sales = buildNavigation(m, person('sales', false), siteFor('sales'));
    for (const section of sales) expect(section.items.length).toBeGreaterThan(0);
    // Per-site staff never see the all-websites pages that need platform permissions.
    expect(ids(person('administrator', false))).not.toContain('people');
    expect(ids(person('administrator', true))).toContain('people');
  });

  it('shows only Administration when no website is chosen', () => {
    const me = person('owner', true);
    expect(buildNavigation(m, me, undefined).map((s) => s.id)).toEqual(['admin']);
  });

  it('finds the section and page for an address, preferring the most specific link', () => {
    const sections = buildNavigation(m, person('owner', true), siteFor('owner'));
    expect(locate(sections, accountItems(m), '/s/hantex-ultra')?.item.id).toBe('overview');
    expect(locate(sections, accountItems(m), '/s/hantex-ultra/staff')?.section?.id).toBe(
      'site-settings',
    );
    expect(locate(sections, accountItems(m), '/staff')?.item.id).toBe('people');
    expect(locate(sections, accountItems(m), '/account')?.item.id).toBe('account');
    expect(locate(sections, accountItems(m), '/nowhere')).toBeNull();
  });
});
