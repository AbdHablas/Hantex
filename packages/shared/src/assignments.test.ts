import { describe, expect, it } from 'vitest';
import {
  checkAssignmentScope,
  coveredSites,
  platformPermissions,
  sitePermissions,
} from './assignments';
import { ALL_PERMISSIONS, PLATFORM_PERMISSIONS, STANDARD_ROLES } from './permissions';

const matrix = new Map(STANDARD_ROLES.map((r) => [r.id, r.permissions as readonly string[]]));

describe('sitePermissions', () => {
  it('gives an all-sites Owner every permission on every site', () => {
    const owner = [{ roleId: 'owner', siteId: null }];
    expect([...sitePermissions(owner, 'site-a', matrix)].sort()).toEqual(
      [...ALL_PERMISSIONS].sort(),
    );
    expect([...platformPermissions(owner, matrix)].sort()).toEqual(
      [...PLATFORM_PERMISSIONS].sort(),
    );
  });

  it('applies a per-site role only on its own site', () => {
    const person = [
      { roleId: 'content-manager', siteId: 'site-a' },
      { roleId: 'viewer', siteId: 'site-b' },
    ];
    expect(sitePermissions(person, 'site-a', matrix).has('site.publish')).toBe(true);
    expect(sitePermissions(person, 'site-b', matrix).has('site.publish')).toBe(false);
    expect(sitePermissions(person, 'site-b', matrix).has('comingSoon.view')).toBe(true);
    expect(sitePermissions(person, 'site-c', matrix).size).toBe(0);
  });

  it('never grants platform permissions through a per-site assignment', () => {
    const custom = new Map([['wide', [...ALL_PERMISSIONS] as readonly string[]]]);
    const person = [{ roleId: 'wide', siteId: 'site-a' }];
    const onSite = sitePermissions(person, 'site-a', custom);
    for (const p of PLATFORM_PERMISSIONS) expect(onSite.has(p)).toBe(false);
    expect(platformPermissions(person, custom).size).toBe(0);
  });

  it('grants nothing for an unknown role', () => {
    expect(sitePermissions([{ roleId: 'gone', siteId: null }], 'site-a', matrix).size).toBe(0);
  });
});

describe('coveredSites', () => {
  it('reports all sites or the listed ones', () => {
    expect(coveredSites([{ roleId: 'owner', siteId: null }])).toBe('all');
    expect(coveredSites([{ roleId: 'viewer', siteId: 's1' }])).toEqual(new Set(['s1']));
    expect(coveredSites([])).toEqual(new Set());
  });
});

describe('checkAssignmentScope', () => {
  const ok = { ok: true };

  it('keeps Owners on all sites', () => {
    expect(
      checkAssignmentScope({ roleId: 'owner', siteId: 's1', roleLocked: true }, [], true),
    ).toEqual({ ok: false, reason: 'owner-all-sites' });
    expect(
      checkAssignmentScope({ roleId: 'owner', siteId: null, roleLocked: true }, [], true),
    ).toEqual(ok);
  });

  it('lets only all-sites staff grant all-sites access', () => {
    expect(
      checkAssignmentScope({ roleId: 'viewer', siteId: null, roleLocked: false }, [], false),
    ).toEqual({ ok: false, reason: 'exceeds-own-scope' });
    expect(
      checkAssignmentScope({ roleId: 'viewer', siteId: 's1', roleLocked: false }, [], false),
    ).toEqual(ok);
  });

  it('never mixes all-sites and per-site assignments', () => {
    expect(
      checkAssignmentScope(
        { roleId: 'viewer', siteId: 's1', roleLocked: false },
        [{ roleId: 'editor', siteId: null }],
        true,
      ),
    ).toEqual({ ok: false, reason: 'mixed-scope' });
    expect(
      checkAssignmentScope(
        { roleId: 'viewer', siteId: null, roleLocked: false },
        [{ roleId: 'editor', siteId: 's1' }],
        true,
      ),
    ).toEqual({ ok: false, reason: 'mixed-scope' });
  });

  it('allows one role per site', () => {
    const existing = [{ roleId: 'editor', siteId: 's1' }];
    expect(
      checkAssignmentScope({ roleId: 'viewer', siteId: 's1', roleLocked: false }, existing, true),
    ).toEqual({ ok: false, reason: 'duplicate-site' });
    expect(
      checkAssignmentScope({ roleId: 'viewer', siteId: 's2', roleLocked: false }, existing, true),
    ).toEqual(ok);
  });
});
