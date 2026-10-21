import { PLATFORM_PERMISSIONS, type Permission } from './permissions';

/**
 * Role assignments across sites (D-025): a person holds either one all-sites assignment or
 * per-site assignments (at most one per site), never both. Owners are always all-sites.
 */
export interface RoleAssignment {
  roleId: string;
  /** null = all sites. */
  siteId: string | null;
}

const platform = new Set<string>(PLATFORM_PERMISSIONS);

/**
 * The permissions a person holds on one site. `rolePermissions` maps role ids to the permissions
 * currently in the matrix. Platform permissions only count from an all-sites assignment, so a
 * per-site role can never act on the platform as a whole.
 */
export function sitePermissions(
  assignments: readonly RoleAssignment[],
  siteId: string,
  rolePermissions: ReadonlyMap<string, readonly string[]>,
): Set<Permission> {
  const result = new Set<Permission>();
  for (const assignment of assignments) {
    if (assignment.siteId !== null && assignment.siteId !== siteId) continue;
    for (const permission of rolePermissions.get(assignment.roleId) ?? []) {
      if (assignment.siteId !== null && platform.has(permission)) continue;
      result.add(permission as Permission);
    }
  }
  return result;
}

/** The platform permissions a person holds (from an all-sites assignment only). */
export function platformPermissions(
  assignments: readonly RoleAssignment[],
  rolePermissions: ReadonlyMap<string, readonly string[]>,
): Set<Permission> {
  const result = new Set<Permission>();
  for (const assignment of assignments) {
    if (assignment.siteId !== null) continue;
    for (const permission of rolePermissions.get(assignment.roleId) ?? []) {
      if (platform.has(permission)) result.add(permission as Permission);
    }
  }
  return result;
}

/** The sites a person can open in the dashboard: 'all', or the listed site ids. */
export function coveredSites(assignments: readonly RoleAssignment[]): 'all' | Set<string> {
  if (assignments.some((a) => a.siteId === null)) return 'all';
  return new Set(assignments.map((a) => a.siteId as string));
}

export type ScopeFailure =
  'owner-all-sites' | 'mixed-scope' | 'duplicate-site' | 'exceeds-own-scope';

export type ScopeResult = { ok: true } | { ok: false; reason: ScopeFailure };

/**
 * May this assignment be added alongside the person's other assignments? `actorAllSites` is
 * whether the person making the change holds an all-sites assignment: only they can grant one.
 * Permission checks for the role itself are in checkRoleAssignment (rules.ts).
 */
export function checkAssignmentScope(
  next: RoleAssignment & { roleLocked: boolean },
  existing: readonly RoleAssignment[],
  actorAllSites: boolean,
): ScopeResult {
  if (next.roleLocked && next.siteId !== null) return { ok: false, reason: 'owner-all-sites' };
  if (next.siteId === null && !actorAllSites) return { ok: false, reason: 'exceeds-own-scope' };
  const nextIsAll = next.siteId === null;
  if (existing.some((a) => (a.siteId === null) !== nextIsAll)) {
    return { ok: false, reason: 'mixed-scope' };
  }
  if (existing.some((a) => a.siteId === next.siteId)) {
    return { ok: false, reason: 'duplicate-site' };
  }
  return { ok: true };
}
