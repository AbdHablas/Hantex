import {
  DEFAULT_COMING_SOON,
  DEFAULT_SITE_SETTINGS,
  PERMISSIONS,
  STANDARD_ROLES,
  type Permission,
  type PermissionDefinition,
} from '@hantex/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';

/**
 * Every site endpoint × every standard role × both sites (D-019, D-025). Expected results come
 * from the approved role table (STANDARD_ROLES), not from the code under test:
 *   - a site the person doesn't cover answers 404, like a site that doesn't exist;
 *   - a missing permission answers 403;
 *   - otherwise the request is allowed.
 */

type Site = 'a' | 'b';
const KEYS: Record<Site, string> = { a: 'hantex-ultra', b: 'second-brand' };
const NAMES: Record<Site, { ar: string; en: string }> = {
  a: { ar: 'Hantex Ultra', en: 'Hantex Ultra' },
  b: { ar: 'Second', en: 'Second Brand' },
};

/** Test staff: one per standard role, plus per-site variants. */
const PEOPLE: Record<string, { roleId: string; site: Site | null }> = {
  owner: { roleId: 'owner', site: null },
  'admin-all': { roleId: 'administrator', site: null },
  'admin-a': { roleId: 'administrator', site: 'a' },
  'content-a': { roleId: 'content-manager', site: 'a' },
  'sales-a': { roleId: 'sales', site: 'a' },
  'editor-a': { roleId: 'editor', site: 'a' },
  'viewer-a': { roleId: 'viewer', site: 'a' },
  'viewer-b': { roleId: 'viewer', site: 'b' },
};

const isPlatform = (p: Permission) => (PERMISSIONS[p] as PermissionDefinition).scope === 'platform';

function holds(person: string, site: Site | null, permission: Permission): boolean {
  const { roleId, site: assigned } = PEOPLE[person]!;
  if (isPlatform(permission) && assigned !== null) return false;
  if (site !== null && assigned !== null && assigned !== site) return false;
  if (site === null && assigned !== null) return false;
  const role = STANDARD_ROLES.find((r) => r.id === roleId)!;
  return role.permissions.includes(permission);
}

const covers = (person: string, site: Site) => {
  const assigned = PEOPLE[person]!.site;
  return assigned === null || assigned === site;
};

interface Endpoint {
  method: string;
  path: string;
  /** All of these are required, unless `any` is set. */
  needs: Permission[];
  any?: boolean;
  body?: (site: Site) => unknown;
}

const SITE_ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '', needs: ['dashboard.view'] },
  { method: 'GET', path: '/overview', needs: ['dashboard.view'] },
  { method: 'GET', path: '/documents/coming-soon', needs: ['comingSoon.view'] },
  { method: 'GET', path: '/documents/coming-soon/versions', needs: ['comingSoon.view'] },
  {
    method: 'PUT',
    path: '/documents/coming-soon/draft',
    needs: ['comingSoon.edit'],
    body: () => DEFAULT_COMING_SOON,
  },
  {
    method: 'POST',
    path: '/documents/coming-soon/publish',
    needs: ['site.publish'],
    body: () => ({}),
  },
  { method: 'GET', path: '/documents/site-settings', needs: ['settings.view'] },
  {
    method: 'PUT',
    path: '/documents/site-settings/draft',
    needs: ['settings.edit'],
    body: () => DEFAULT_SITE_SETTINGS,
  },
  { method: 'GET', path: '/documents/theme', needs: ['appearance.edit'] },
  {
    method: 'POST',
    path: '/preview',
    needs: ['dashboard.view'],
    body: () => ({ drafts: { 'coming-soon': false, 'site-settings': false, theme: false } }),
  },
  // Website builder (D-035 to D-037).
  { method: 'GET', path: '/pages', needs: ['pages.view'] },
  { method: 'GET', path: '/menus', needs: ['pages.view'] },
  { method: 'GET', path: '/layout', needs: ['pages.view'] },
  { method: 'GET', path: '/changes', needs: ['pages.view'] },
  {
    method: 'PUT',
    path: '/menus',
    needs: ['pages.edit'],
    body: () => ({ header: [], footer: [] }),
  },
  { method: 'GET', path: '/subscribers', needs: ['subscribers.view'] },
  { method: 'GET', path: '/subscribers/export', needs: ['subscribers.export'] },
  {
    method: 'GET',
    path: '/publish/jobs',
    needs: ['site.publish', 'appearance.publish'],
    any: true,
  },
  { method: 'GET', path: '/staff', needs: ['staff.view'] },
  { method: 'GET', path: '/staff/invitations', needs: ['staff.view'] },
  { method: 'GET', path: '/audit', needs: ['audit.view'] },
  { method: 'PATCH', path: '', needs: ['sites.manage'], body: (site) => ({ name: NAMES[site] }) },
];

const PLATFORM_ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/staff', needs: ['staff.view'] },
  { method: 'GET', path: '/api/staff/invitations', needs: ['staff.view'] },
  { method: 'GET', path: '/api/audit', needs: ['audit.view'] },
];

let h: Harness;
const cookies: Record<string, string> = {};

beforeAll(async () => {
  h = await createHarness();
  for (const [id, p] of Object.entries(PEOPLE)) {
    cookies[id] = await h.staff(`matrix-${id}`, [{ roleId: p.roleId, site: p.site }]);
  }
});
afterAll(() => h.close());

const allowedOn = (person: string, site: Site | null, e: Endpoint) =>
  e.any
    ? e.needs.some((p) => holds(person, site, p))
    : e.needs.every((p) => holds(person, site, p));

describe('site endpoints', () => {
  const cases = SITE_ENDPOINTS.flatMap((e) =>
    Object.keys(PEOPLE).flatMap((person) =>
      (['a', 'b'] as const).map((site) => ({ e, person, site })),
    ),
  );

  it.each(cases)('$e.method $e.path as $person on site $site', async ({ e, person, site }) => {
    const response = await h.request(e.method, `/api/sites/${KEYS[site]}${e.path}`, {
      cookie: cookies[person]!,
      ...(e.body ? { body: e.body(site) } : {}),
    });
    if (!covers(person, site)) {
      expect(response.status, h.errors.at(-1)).toBe(404);
    } else if (!allowedOn(person, site, e)) {
      expect(response.status).toBe(403);
    } else {
      const detail = `${await response.clone().text()} ${h.errors.at(-1) ?? ''}`;
      expect(response.status, detail).toBeLessThan(400);
    }
  });

  it.each(SITE_ENDPOINTS)('$method $path needs a session', async (e) => {
    const response = await h.request(e.method, `/api/sites/${KEYS.a}${e.path}`, {
      ...(e.body ? { body: e.body('a') } : {}),
    });
    expect(response.status).toBe(401);
  });

  it('answers 404 for a site that does not exist, even to an Owner', async () => {
    for (const key of ['no-such-site', 'NOT_A_KEY']) {
      const response = await h.request('GET', `/api/sites/${key}/overview`, {
        cookie: cookies['owner']!,
      });
      expect(response.status).toBe(404);
    }
  });
});

describe('platform endpoints (all-sites roles only)', () => {
  const cases = PLATFORM_ENDPOINTS.flatMap((e) =>
    Object.keys(PEOPLE).map((person) => ({ e, person })),
  );

  it.each(cases)('$e.method $e.path as $person', async ({ e, person }) => {
    const response = await h.request(e.method, e.path, { cookie: cookies[person]! });
    expect(response.status).toBe(allowedOn(person, null, e) ? 200 : 403);
  });

  it('shows the roles matrix to anyone who manages staff on some site', async () => {
    for (const person of Object.keys(PEOPLE)) {
      const response = await h.request('GET', '/api/roles', { cookie: cookies[person]! });
      const viewsStaff = ['owner', 'admin-all', 'admin-a'].includes(person);
      expect(response.status, person).toBe(viewsStaff ? 200 : 403);
    }
  });

  it('lists only the sites each person covers', async () => {
    for (const [person, p] of Object.entries(PEOPLE)) {
      const response = await h.request('GET', '/api/me', { cookie: cookies[person]! });
      const body = await response.json<{ sites: { key: string }[] }>();
      const expected = p.site ? [KEYS[p.site]] : [KEYS.a, KEYS.b];
      expect(
        body.sites.map((s) => s.key).filter((k) => k === KEYS.a || k === KEYS.b),
        person,
      ).toEqual(expected);
    }
  });

  it('lets only an Owner create a site', async () => {
    const site = {
      key: 'matrix-new',
      name: { ar: 'New', en: 'New' },
      locales: ['en'],
      defaultLocale: 'en',
      template: 'coming-soon',
    };
    for (const person of Object.keys(PEOPLE).filter((p) => p !== 'owner')) {
      const response = await h.request('POST', '/api/sites', {
        cookie: cookies[person]!,
        body: site,
      });
      expect(response.status, person).toBe(403);
    }
    const created = await h.request('POST', '/api/sites', {
      cookie: cookies['owner']!,
      body: site,
    });
    expect(created.status).toBe(201);
  });

  it('lets only an Owner switch a site between Coming Soon, maintenance and live', async () => {
    for (const person of Object.keys(PEOPLE).filter((p) => p !== 'owner')) {
      const site: Site = PEOPLE[person]!.site ?? 'a';
      const response = await h.request('PUT', `/api/sites/${KEYS[site]}/mode`, {
        cookie: cookies[person]!,
        body: { mode: 'maintenance' },
      });
      expect(response.status, person).toBe(403);
    }
  });
});
