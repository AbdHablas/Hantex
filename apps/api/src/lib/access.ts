import { rolePermissions, roles, userRoles, users, type Database } from '@hantex/db';
import { eq } from 'drizzle-orm';

export interface Access {
  userId: string;
  email: string;
  name: string;
  status: string;
  roleId: string | null;
  role: { id: string; nameAr: string; nameEn: string; protected: boolean; locked: boolean } | null;
  permissions: Set<string>;
  isOwner: boolean;
}

/** Loads a staff member's role and permissions from the current matrix (checked on every request). */
export async function loadAccess(db: Database, userId: string): Promise<Access | null> {
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      roleId: roles.id,
      nameAr: roles.nameAr,
      nameEn: roles.nameEn,
      protected: roles.protected,
      locked: roles.locked,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(users.id, userId));
  if (!row) return null;

  const permissions = row.roleId
    ? new Set(
        (await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, row.roleId))).map(
          (p) => p.permission,
        ),
      )
    : new Set<string>();

  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    status: row.status,
    roleId: row.roleId,
    role:
      row.roleId && row.nameAr !== null && row.nameEn !== null
        ? {
            id: row.roleId,
            nameAr: row.nameAr,
            nameEn: row.nameEn,
            protected: row.protected === true,
            locked: row.locked === true,
          }
        : null,
    permissions,
    isOwner: row.roleId === 'owner',
  };
}
