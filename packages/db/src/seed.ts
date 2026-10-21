import { ALL_PERMISSIONS, STANDARD_ROLES, newSiteSchema, type NewSite } from '@hantex/shared';
import { eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from './client';
import { rolePermissions, roles, siteDomains, sites } from './schema';

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

/**
 * The first site (D-024). Its name is the brand name in both languages until the Owner changes
 * it in the dashboard. The domains start as 'pending': they become active only through a
 * production deployment the Owner approves.
 */
export const FIRST_SITE: NewSite & { domains: { hostname: string; isPrimary: boolean }[] } = {
  key: 'hantex-ultra',
  name: { ar: 'Hantex Ultra', en: 'Hantex Ultra' },
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  template: 'coming-soon',
  domains: [
    { hostname: 'www.hantexultra.com', isPrimary: true },
    { hostname: 'hantexultra.com', isPrimary: false },
  ],
};

/**
 * Creates a site in Coming Soon mode with pending domains, if no site has its key yet. An
 * existing site is left exactly as it is, so the dashboard's changes are never overwritten.
 * Returns the site's id.
 */
export async function ensureSite(
  db: Database,
  site: NewSite & { domains?: { hostname: string; isPrimary: boolean }[] },
): Promise<string> {
  const { domains = [], ...fields } = site;
  const valid = newSiteSchema.parse(fields);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(sites)
      .values({
        key: valid.key,
        nameAr: valid.name.ar,
        nameEn: valid.name.en,
        locales: valid.locales,
        defaultLocale: valid.defaultLocale,
        template: valid.template,
      })
      .onConflictDoNothing({ target: sites.key })
      .returning({ id: sites.id });
    if (created) {
      if (domains.length > 0) {
        await tx
          .insert(siteDomains)
          .values(domains.map((d) => ({ siteId: created.id, ...d, status: 'pending' })));
      }
      return created.id;
    }
    const [existing] = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.key, valid.key));
    if (!existing) throw new Error(`Site "${valid.key}" could not be created or found`);
    return existing.id;
  });
}
