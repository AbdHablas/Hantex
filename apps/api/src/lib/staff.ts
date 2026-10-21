import { rolePermissions, roles, userRoles, users, type Database } from '@hantex/db';
import type { RoleShape } from '@hantex/shared';
import { and, count, eq } from 'drizzle-orm';
import type { AppEnv } from '../context';
import { emailTemplates } from './email';

export async function loadRoleShape(db: Database, roleId: string): Promise<(RoleShape & { nameAr: string; nameEn: string }) | null> {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
  if (!role) return null;
  const permissions = (await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId))).map(
    (p) => p.permission,
  );
  return { id: role.id, permissions, protected: role.protected, locked: role.locked, nameAr: role.nameAr, nameEn: role.nameEn };
}

export async function activeOwnerCount(db: Database): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.roleId, 'owner'), eq(users.status, 'active')));
  return row?.n ?? 0;
}

/** Emails every active Owner about a staff or role change (best effort; failures are logged). */
export async function notifyOwners(
  c: { var: AppEnv['Variables']; env: AppEnv['Bindings'] },
  summary: { ar: string; en: string },
): Promise<void> {
  try {
    const owners = await c.var.db
      .select({ email: users.email })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.roleId, 'owner'), eq(users.status, 'active')));
    const sender = c.var.deps.email(c.env);
    const message = emailTemplates.staffChange({ actor: c.var.access.name, summaryAr: summary.ar, summaryEn: summary.en });
    await Promise.all(owners.map((o) => sender.send({ to: o.email, ...message })));
  } catch (error) {
    console.error('owner notification failed', error instanceof Error ? error.message : error);
  }
}
