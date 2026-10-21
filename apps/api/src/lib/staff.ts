import { roleAssignments, rolePermissions, roles, users, type Database } from '@hantex/db/worker';
import type { RoleShape } from '@hantex/shared';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { AppEnv } from '../context';
import { emailTemplates } from './email';

export async function loadRoleShape(
  db: Database,
  roleId: string,
): Promise<(RoleShape & { nameAr: string; nameEn: string }) | null> {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
  if (!role) return null;
  const permissions = (
    await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId))
  ).map((p) => p.permission);
  return {
    id: role.id,
    permissions,
    protected: role.protected,
    locked: role.locked,
    nameAr: role.nameAr,
    nameEn: role.nameEn,
  };
}

/** Active staff holding a locked (Owner) role, which is always all-sites. */
const activeOwners = (db: Database) =>
  db
    .select({ id: users.id, email: users.email })
    .from(roleAssignments)
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(and(eq(roles.locked, true), isNull(roleAssignments.siteId), eq(users.status, 'active')));

export async function activeOwnerCount(db: Database): Promise<number> {
  return (await activeOwners(db)).length;
}

/** How many people hold this role (on any site), for the roles matrix. */
export async function roleMemberCounts(db: Database) {
  return db
    .select({ roleId: roleAssignments.roleId, n: count() })
    .from(roleAssignments)
    .groupBy(roleAssignments.roleId);
}

/** Emails every active Owner about a staff or role change (best effort; failures are logged). */
export async function notifyOwners(
  c: { var: AppEnv['Variables']; env: AppEnv['Bindings'] },
  summary: { ar: string; en: string },
): Promise<void> {
  try {
    const owners = await activeOwners(c.var.db);
    const sender = c.var.deps.email(c.env);
    const message = emailTemplates.staffChange({
      actor: c.var.access.name,
      summaryAr: summary.ar,
      summaryEn: summary.en,
    });
    await Promise.all(owners.map((o) => sender.send({ to: o.email, ...message })));
  } catch (error) {
    console.error('owner notification failed', error instanceof Error ? error.message : error);
  }
}
