import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PLATFORM_PERMISSIONS,
  RESERVED_PERMISSIONS,
  STANDARD_ROLES,
  permissionsOf,
} from './permissions';

// The approved matrix (docs/roles-and-permissions.md, D-019, D-022, D-035, D-040).
const EXPECTED: Record<string, string[]> = {
  owner: Object.keys(PERMISSIONS),
  administrator: [
    'dashboard.view',
    'comingSoon.view',
    'comingSoon.edit',
    'pages.view',
    'pages.edit',
    'media.view',
    'media.edit',
    'media.delete',
    'site.publish',
    'settings.view',
    'settings.edit',
    'subscribers.view',
    'subscribers.export',
    'subscribers.delete',
    'subscribers.announce',
    'appearance.edit',
    'appearance.publish',
    'staff.view',
    'staff.manage',
    'audit.view',
  ],
  'content-manager': [
    'dashboard.view',
    'comingSoon.view',
    'comingSoon.edit',
    'pages.view',
    'pages.edit',
    'media.view',
    'media.edit',
    'site.publish',
    'settings.view',
  ],
  sales: [
    'dashboard.view',
    'comingSoon.view',
    'pages.view',
    'media.view',
    'settings.view',
    'subscribers.view',
    'subscribers.export',
  ],
  editor: [
    'dashboard.view',
    'comingSoon.view',
    'comingSoon.edit',
    'pages.view',
    'pages.edit',
    'media.view',
    'media.edit',
  ],
  viewer: ['dashboard.view', 'comingSoon.view', 'pages.view', 'media.view', 'settings.view'],
};

describe('standard roles', () => {
  it('are exactly the six approved roles', () => {
    expect(STANDARD_ROLES.map((r) => r.id)).toEqual(Object.keys(EXPECTED));
  });

  it.each(Object.entries(EXPECTED))('%s has exactly the approved permissions', (id, expected) => {
    expect([...permissionsOf(id)].sort()).toEqual([...expected].sort());
  });

  it('keeps owner-only permissions out of every other standard role', () => {
    for (const role of STANDARD_ROLES.filter((r) => r.id !== 'owner')) {
      for (const permission of RESERVED_PERMISSIONS) {
        expect(role.permissions).not.toContain(permission);
      }
    }
  });

  it('never gives customer personal data to Content Manager, Editor or Viewer', () => {
    for (const id of ['content-manager', 'editor', 'viewer']) {
      expect([...permissionsOf(id)].some((p) => p.startsWith('subscribers.'))).toBe(false);
    }
  });

  it('labels every permission and role in Arabic and English', () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(permission.label.ar.length).toBeGreaterThan(0);
      expect(permission.label.en.length).toBeGreaterThan(0);
    }
    for (const role of STANDARD_ROLES) {
      expect(role.name.ar.length).toBeGreaterThan(0);
      expect(role.name.en.length).toBeGreaterThan(0);
    }
  });
});

describe('permission scopes (D-025)', () => {
  it('keeps platform-wide permissions Owner-only', () => {
    expect([...PLATFORM_PERMISSIONS].sort()).toEqual(
      [
        'fonts.manage',
        'roles.manage',
        'security.manage',
        'sites.manage',
        'staff.manageAdmins',
      ].sort(),
    );
    for (const p of PLATFORM_PERMISSIONS) expect(RESERVED_PERMISSIONS).toContain(p);
  });
});
