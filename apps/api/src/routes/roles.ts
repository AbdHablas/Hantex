import { validate } from '../lib/validate';
import {
  invitations,
  resetStandardRole,
  roleAssignments,
  rolePermissions,
  roles,
} from '@hantex/db/worker';
import { PERMISSIONS, checkRoleEdit, type PermissionDefinition } from '@hantex/shared';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import { randomToken } from '../lib/crypto';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { loadRoleShape, notifyOwners, roleMemberCounts } from '../lib/staff';
import { requirePlatformPermission } from '../middleware/session';

const bilingual = (max: number) =>
  z.strictObject({ ar: z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max) });
const optionalBilingual = (max: number) =>
  z.strictObject({ ar: z.string().trim().max(max), en: z.string().trim().max(max) });

const actorOf = (v: AppEnv['Variables']) => ({
  userId: v.access.userId,
  permissions: v.permissions,
});
const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });

async function replacePermissions(
  v: AppEnv['Variables'],
  roleId: string,
  permissions: readonly string[],
) {
  await v.db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (permissions.length > 0) {
      await tx
        .insert(rolePermissions)
        .values(permissions.map((permission) => ({ roleId, permission })));
    }
  });
}

/** The dynamic roles matrix (D-019): roles are data; permissions are the server's checks. */
export const roleRoutes = new Hono<AppEnv>()
  .get(
    '/',
    async (c, next) => {
      // Anyone who can view staff on at least one site sees the matrix, to choose roles there.
      const { access } = c.var;
      const viewsStaff = access.assignments.some((a) =>
        (access.rolePermissions.get(a.roleId) ?? []).includes('staff.view'),
      );
      if (!viewsStaff && !c.var.permissions.has('roles.manage'))
        throw forbidden('missing-permission');
      await next();
    },
    async (c) => {
      const db = c.var.db;
      const allRoles = await db.select().from(roles).orderBy(roles.createdAt);
      const grants = await db.select().from(rolePermissions);
      const counts = await roleMemberCounts(db);
      return c.json({
        permissions: Object.entries(PERMISSIONS).map(([id, def]) => {
          const d = def as PermissionDefinition;
          return {
            id,
            group: d.group,
            scope: d.scope,
            label: d.label,
            sensitive: d.sensitive ?? null,
            reserved: d.reserved === true,
          };
        }),
        roles: allRoles.map((r) => ({
          id: r.id,
          name: { ar: r.nameAr, en: r.nameEn },
          description: { ar: r.descriptionAr, en: r.descriptionEn },
          isStandard: r.isStandard,
          protected: r.protected,
          locked: r.locked,
          permissions: grants
            .filter((g) => g.roleId === r.id)
            .map((g) => g.permission)
            .sort(),
          members: counts.find((x) => x.roleId === r.id)?.n ?? 0,
        })),
      });
    },
  )

  .post(
    '/',
    requirePlatformPermission('roles.manage'),
    validate(
      'json',
      z.strictObject({
        name: bilingual(60),
        description: optionalBilingual(200),
        permissions: z.array(z.string()).max(100),
      }),
    ),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      const id = `custom-${randomToken(6).toLowerCase()}`;
      const allowed = checkRoleEdit(
        actorOf(v),
        { id, permissions: [], protected: false, locked: false },
        body.permissions,
      );
      if (!allowed.ok)
        throw forbidden(
          allowed.reason,
          allowed.permissions ? { permissions: allowed.permissions } : undefined,
        );
      await v.db.insert(roles).values({
        id,
        nameAr: body.name.ar,
        nameEn: body.name.en,
        descriptionAr: body.description.ar,
        descriptionEn: body.description.en,
      });
      await replacePermissions(v, id, [...new Set(body.permissions)]);
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'role.created',
          targetType: 'role',
          targetId: id,
          details: { permissions: body.permissions },
        },
        v.requestId,
      );
      await notifyOwners(c, {
        ar: `إنشاء دور «${body.name.ar}»`,
        en: `created the role ${body.name.en}`,
      });
      return c.json({ id }, 201);
    },
  )

  .put(
    '/:id/permissions',
    requirePlatformPermission('roles.manage'),
    validate('json', z.strictObject({ permissions: z.array(z.string()).max(100) })),
    async (c) => {
      const v = c.var;
      const role = await loadRoleShape(v.db, c.req.param('id'));
      if (!role) throw notFound();
      const next = [...new Set(c.req.valid('json').permissions)].sort();
      const allowed = checkRoleEdit(actorOf(v), role, next);
      if (!allowed.ok)
        throw forbidden(
          allowed.reason,
          allowed.permissions ? { permissions: allowed.permissions } : undefined,
        );
      await replacePermissions(v, role.id, next);
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'role.permissions.changed',
          targetType: 'role',
          targetId: role.id,
          details: { before: [...role.permissions].sort(), after: next },
        },
        v.requestId,
      );
      await notifyOwners(c, {
        ar: `تعديل صلاحيات دور «${role.nameAr}»`,
        en: `changed the permissions of ${role.nameEn}`,
      });
      return c.json({ ok: true });
    },
  )

  .patch(
    '/:id',
    requirePlatformPermission('roles.manage'),
    validate(
      'json',
      z.strictObject({
        name: bilingual(60).optional(),
        description: optionalBilingual(200).optional(),
      }),
    ),
    async (c) => {
      const v = c.var;
      const role = await loadRoleShape(v.db, c.req.param('id'));
      if (!role) throw notFound();
      if (role.locked) throw forbidden('locked-role');
      const body = c.req.valid('json');
      await v.db
        .update(roles)
        .set({
          ...(body.name ? { nameAr: body.name.ar, nameEn: body.name.en } : {}),
          ...(body.description
            ? { descriptionAr: body.description.ar, descriptionEn: body.description.en }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(roles.id, role.id));
      await writeAudit(
        v.db,
        auditActor(v),
        { action: 'role.renamed', targetType: 'role', targetId: role.id },
        v.requestId,
      );
      return c.json({ ok: true });
    },
  )

  .delete('/:id', requirePlatformPermission('roles.manage'), async (c) => {
    const v = c.var;
    const [role] = await v.db
      .select()
      .from(roles)
      .where(eq(roles.id, c.req.param('id')));
    if (!role) throw notFound();
    if (role.isStandard) throw forbidden('standard-role');
    const [members] = await v.db
      .select({ n: count() })
      .from(roleAssignments)
      .where(eq(roleAssignments.roleId, role.id));
    const [pending] = await v.db
      .select({ n: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.roleId, role.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      );
    if ((members?.n ?? 0) > 0 || (pending?.n ?? 0) > 0) throw conflict('role-in-use');
    await v.db.delete(invitations).where(eq(invitations.roleId, role.id));
    await v.db.delete(roles).where(eq(roles.id, role.id));
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'role.deleted', targetType: 'role', targetId: role.id },
      v.requestId,
    );
    await notifyOwners(c, {
      ar: `حذف دور «${role.nameAr}»`,
      en: `deleted the role ${role.nameEn}`,
    });
    return c.json({ ok: true });
  })

  .post('/:id/reset', requirePlatformPermission('roles.manage'), async (c) => {
    const v = c.var;
    const [role] = await v.db
      .select()
      .from(roles)
      .where(eq(roles.id, c.req.param('id')));
    if (!role) throw notFound();
    if (!role.isStandard) throw badRequest('not-a-standard-role');
    await resetStandardRole(v.db, role.id);
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'role.reset', targetType: 'role', targetId: role.id },
      v.requestId,
    );
    await notifyOwners(c, {
      ar: `إعادة دور «${role.nameAr}» إلى الوضع القياسي`,
      en: `reset ${role.nameEn} to its standard permissions`,
    });
    return c.json({ ok: true });
  });
