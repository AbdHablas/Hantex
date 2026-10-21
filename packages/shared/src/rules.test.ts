import { describe, expect, it } from 'vitest';
import { permissionsOf } from './permissions';
import { checkRoleAssignment, checkRoleEdit, checkStaffChange } from './rules';

const owner = { userId: 'u-owner', permissions: permissionsOf('owner') };
const admin = { userId: 'u-admin', permissions: permissionsOf('administrator') };
const editor = { userId: 'u-editor', permissions: permissionsOf('editor') };

const role = (id: string, extra: Partial<{ protected: boolean; locked: boolean }> = {}) => ({
  id,
  permissions: [...permissionsOf(id)],
  protected: id === 'owner' || id === 'administrator',
  locked: id === 'owner',
  ...extra,
});

describe('checkRoleAssignment', () => {
  it('lets an Owner assign any role, including Owner and Administrator', () => {
    expect(checkRoleAssignment(owner, role('owner'))).toEqual({ ok: true });
    expect(checkRoleAssignment(owner, role('administrator'))).toEqual({ ok: true });
  });

  it('lets an Administrator assign the lower standard roles', () => {
    for (const id of ['content-manager', 'sales', 'editor', 'viewer']) {
      expect(checkRoleAssignment(admin, role(id))).toEqual({ ok: true });
    }
  });

  it('stops an Administrator from creating Owners or other Administrators', () => {
    expect(checkRoleAssignment(admin, role('owner'))).toMatchObject({
      ok: false,
      reason: 'protected-role',
    });
    expect(checkRoleAssignment(admin, role('administrator'))).toMatchObject({
      ok: false,
      reason: 'protected-role',
    });
  });

  it('stops anyone granting a role with permissions they do not hold', () => {
    const custom = {
      id: 'custom',
      permissions: ['dashboard.view', 'audit.view'],
      protected: false,
      locked: false,
    };
    const limitedAdmin = { userId: 'u2', permissions: new Set(['staff.manage', 'dashboard.view']) };
    expect(checkRoleAssignment(limitedAdmin, custom)).toMatchObject({
      ok: false,
      reason: 'exceeds-own-permissions',
    });
  });

  it('requires the staff.manage permission', () => {
    expect(checkRoleAssignment(editor, role('viewer'))).toMatchObject({
      ok: false,
      reason: 'missing-permission',
    });
  });
});

describe('checkStaffChange', () => {
  it('stops people changing their own account or role', () => {
    expect(
      checkStaffChange(owner, { userId: 'u-owner', isOwner: true }, { ownerCount: 2 }),
    ).toMatchObject({
      ok: false,
      reason: 'self-change',
    });
  });

  it('stops anyone but an Owner changing an Owner or Administrator', () => {
    expect(
      checkStaffChange(admin, { userId: 'u-o2', isOwner: true }, { ownerCount: 2 }),
    ).toMatchObject({
      ok: false,
      reason: 'protected-role',
    });
    expect(
      checkStaffChange(
        admin,
        { userId: 'u-a2', isOwner: false, isProtected: true },
        { ownerCount: 1 },
      ),
    ).toMatchObject({ ok: false, reason: 'protected-role' });
  });

  it('protects the last remaining Owner', () => {
    expect(
      checkStaffChange(owner, { userId: 'u-o2', isOwner: true }, { ownerCount: 1 }),
    ).toMatchObject({
      ok: false,
      reason: 'last-owner',
    });
    expect(checkStaffChange(owner, { userId: 'u-o2', isOwner: true }, { ownerCount: 2 })).toEqual({
      ok: true,
    });
  });

  it('lets an Administrator change lower staff', () => {
    expect(checkStaffChange(admin, { userId: 'u-e', isOwner: false }, { ownerCount: 1 })).toEqual({
      ok: true,
    });
  });
});

describe('checkRoleEdit (dynamic matrix)', () => {
  it('only lets holders of roles.manage edit the matrix', () => {
    expect(checkRoleEdit(admin, role('editor'), ['dashboard.view'])).toMatchObject({
      ok: false,
      reason: 'missing-permission',
    });
  });

  it('keeps the Owner role locked to every permission', () => {
    expect(checkRoleEdit(owner, role('owner'), ['dashboard.view'])).toMatchObject({
      ok: false,
      reason: 'locked-role',
    });
  });

  it('never lets owner-only permissions into another role', () => {
    expect(
      checkRoleEdit(owner, role('administrator'), ['dashboard.view', 'roles.manage']),
    ).toMatchObject({
      ok: false,
      reason: 'reserved-permission',
    });
  });

  it('rejects permissions that do not exist', () => {
    expect(
      checkRoleEdit(owner, role('editor'), ['dashboard.view', 'launch.missiles']),
    ).toMatchObject({
      ok: false,
      reason: 'unknown-permission',
    });
  });

  it('allows an Owner to change what a standard role can do', () => {
    expect(checkRoleEdit(owner, role('editor'), ['dashboard.view', 'comingSoon.view'])).toEqual({
      ok: true,
    });
  });
});
