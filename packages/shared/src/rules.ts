import { RESERVED_PERMISSIONS, isPermission } from './permissions';

/** Privilege-escalation rules (docs/roles-and-permissions.md), enforced on the server. */

export interface Actor {
  userId: string;
  permissions: ReadonlySet<string>;
}

export interface RoleShape {
  id: string;
  permissions: readonly string[];
  protected: boolean;
  locked: boolean;
}

export type RuleFailure =
  | 'missing-permission'
  | 'protected-role'
  | 'exceeds-own-permissions'
  | 'self-change'
  | 'last-owner'
  | 'locked-role'
  | 'reserved-permission'
  | 'unknown-permission';

export type RuleResult = { ok: true } | { ok: false; reason: RuleFailure; permissions?: string[] };

const ok: RuleResult = { ok: true };
const fail = (reason: RuleFailure, permissions?: string[]): RuleResult =>
  permissions ? { ok: false, reason, permissions } : { ok: false, reason };

/** May the actor give this role to someone (invitation or role change)? */
export function checkRoleAssignment(actor: Actor, role: RoleShape): RuleResult {
  if (!actor.permissions.has('staff.manage')) return fail('missing-permission');
  if (role.protected && !actor.permissions.has('staff.manageAdmins')) return fail('protected-role');
  const missing = role.permissions.filter((p) => !actor.permissions.has(p));
  if (missing.length > 0) return fail('exceeds-own-permissions', missing);
  return ok;
}

/**
 * May the actor change this staff member (role change, disable, remove)?
 * `ownerCount` is the number of active Owners, so the last one can never be removed or demoted.
 */
export function checkStaffChange(
  actor: Actor,
  target: { userId: string; isOwner: boolean; isProtected?: boolean },
  context: { ownerCount: number },
): RuleResult {
  if (!actor.permissions.has('staff.manage')) return fail('missing-permission');
  if (actor.userId === target.userId) return fail('self-change');
  if (
    (target.isOwner || target.isProtected === true) &&
    !actor.permissions.has('staff.manageAdmins')
  ) {
    return fail('protected-role');
  }
  if (target.isOwner && context.ownerCount <= 1) return fail('last-owner');
  return ok;
}

/** May the actor set this role's permissions to `next` (dynamic matrix, D-019)? */
export function checkRoleEdit(actor: Actor, role: RoleShape, next: readonly string[]): RuleResult {
  if (!actor.permissions.has('roles.manage')) return fail('missing-permission');
  if (role.locked) return fail('locked-role');
  const unknown = next.filter((p) => !isPermission(p));
  if (unknown.length > 0) return fail('unknown-permission', unknown);
  const reserved = next.filter((p) => (RESERVED_PERMISSIONS as readonly string[]).includes(p));
  if (reserved.length > 0) return fail('reserved-permission', reserved);
  const missing = next.filter((p) => !actor.permissions.has(p));
  if (missing.length > 0) return fail('exceeds-own-permissions', missing);
  return ok;
}
