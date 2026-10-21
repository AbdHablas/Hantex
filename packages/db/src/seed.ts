import { ALL_PERMISSIONS, STANDARD_ROLES } from '@hantex/shared';
import { eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from './client';
import { rolePermissions, roles } from './schema';

/**
 * Ensures the six standard roles exist (D-019). Existing roles keep the permissions an Owner set
 * in the dashboard, except the locked Owner role, which always holds every permission — so new
 * permissions added in code reach the Owner on the next deploy.
 */
export async function syncStandardRoles(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    // Drop permissions that no longer exist in code, so the matrix always matches the server checks.
    await tx
      .delete(rolePermissions)
      .where(notInArray(rolePermissions.permission, [...ALL_PERMISSIONS]));

    for (const role of STANDARD_ROLES) {
      const inserted = await tx
        .insert(roles)
        .values({
          id: role.id,
          nameAr: role.name.ar,
          nameEn: role.name.en,
          descriptionAr: role.description.ar,
          descriptionEn: role.description.en,
          isStandard: true,
          protected: role.protected,
          locked: role.locked,
        })
        .onConflictDoUpdate({
          target: roles.id,
          set: { isStandard: true, protected: role.protected, locked: role.locked },
        })
        .returning({ created: sql<boolean>`(xmax = 0)` });

      const created = inserted[0]?.created === true;
      const permissions = role.locked ? ALL_PERMISSIONS : role.permissions;
      if (created || role.locked) {
        await tx
          .insert(rolePermissions)
          .values(permissions.map((permission) => ({ roleId: role.id, permission })))
          .onConflictDoNothing();
      }
    }
  });
}

/** Restores a standard role to its documented permissions ("Reset to standard" in the dashboard). */
export async function resetStandardRole(db: Database, roleId: string): Promise<void> {
  const role = STANDARD_ROLES.find((r) => r.id === roleId);
  if (!role) throw new Error(`"${roleId}" is not a standard role`);
  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    await tx.insert(rolePermissions).values(
      (role.locked ? ALL_PERMISSIONS : role.permissions).map((permission) => ({
        roleId: role.id,
        permission,
      })),
    );
  });
}
