import { roleAssignments, rolePermissions, roles, users, type Database } from '@hantex/db/worker';
import {
  coveredSites,
  platformPermissions,
  sitePermissions,
  type Permission,
  type RoleAssignment,
} from '@hantex/shared';
import { eq, inArray } from 'drizzle-orm';

export interface AssignedRole {
  id: string;
  nameAr: string;
  nameEn: string;
  protected: boolean;
  locked: boolean;
}

/**
 * A staff member's account and role assignments (D-025), loaded from the current matrix on every
 * request. Permissions are worked out per site with `permissionsOn`.
 */
export interface Access {
  userId: string;
  email: string;
  name: string;
  status: string;
  assignments: (RoleAssignment & { role: AssignedRole })[];
  /** Role id → permissions currently in the matrix, for the roles this person holds. */
  rolePermissions: Map<string, string[]>;
  /** Holds an all-sites assignment. */
  allSites: boolean;
  isOwner: boolean;
  /** Whether any of their roles is protected (Owner, Administrator). */
  isProtected: boolean;
  /** Platform-wide permissions (from an all-sites assignment only). */
  platform: Set<Permission>;
  /** 'all' or the ids of the sites the person can open. */
  sites: 'all' | Set<string>;
}

/** The permissions this person holds on one site. */
export const permissionsOn = (access: Access, siteId: string): Set<Permission> =>
  sitePermissions(access.assignments, siteId, access.rolePermissions);

/**
 * The permissions that apply to the dashboard as a whole: everything from an all-sites
 * assignment. Per-site staff use the site-scoped API instead.
 */
export function allSitesPermissions(access: Access): Set<Permission> {
  const all = access.assignments.find((a) => a.siteId === null);
  return new Set((all ? access.rolePermissions.get(all.roleId) : []) as Permission[]);
}

export const coversSite = (access: Access, siteId: string): boolean =>
  access.sites === 'all' || access.sites.has(siteId);

export async function loadAccess(db: Database, userId: string): Promise<Access | null> {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, status: users.status })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;

  const rows = await db
    .select({
      roleId: roleAssignments.roleId,
      siteId: roleAssignments.siteId,
      nameAr: roles.nameAr,
      nameEn: roles.nameEn,
      protected: roles.protected,
      locked: roles.locked,
    })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(eq(roleAssignments.userId, userId));

  const roleIds = [...new Set(rows.map((r) => r.roleId))];
  const grants =
    roleIds.length > 0
      ? await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, roleIds))
      : [];
  const matrix = new Map<string, string[]>(roleIds.map((id) => [id, []]));
  for (const grant of grants) matrix.get(grant.roleId)?.push(grant.permission);

  const assignments = rows.map((r) => ({
    roleId: r.roleId,
    siteId: r.siteId,
    role: {
      id: r.roleId,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      protected: r.protected,
      locked: r.locked,
    },
  }));

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    assignments,
    rolePermissions: matrix,
    allSites: assignments.some((a) => a.siteId === null),
    isOwner: assignments.some((a) => a.role.locked && a.siteId === null),
    isProtected: assignments.some((a) => a.role.protected),
    platform: platformPermissions(assignments, matrix),
    sites: coveredSites(assignments),
  };
}
