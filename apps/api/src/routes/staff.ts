import { validate } from '../lib/validate';
import { invitations, passkeys, roles, sessions, userRoles, users } from '@hantex/db';
import { checkRoleAssignment, checkStaffChange } from '@hantex/shared';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { maskContact, writeAudit } from '../lib/audit';
import { loadAccess } from '../lib/access';
import { randomToken, sha256Hex } from '../lib/crypto';
import { emailTemplates } from '../lib/email';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { activeOwnerCount, loadRoleShape, notifyOwners } from '../lib/staff';
import { requirePermission } from '../middleware/session';

export const INVITATION_TTL_HOURS = 72;

const actorOf = (v: AppEnv['Variables']) => ({ userId: v.access.userId, permissions: v.access.permissions });
const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });

/** Checks a staff change against the escalation rules (no self-changes, protected roles, last Owner). */
async function guardTarget(v: AppEnv['Variables'], targetUserId: string) {
  const target = await loadAccess(v.db, targetUserId);
  if (!target) throw notFound();
  const result = checkStaffChange(
    actorOf(v),
    { userId: target.userId, isOwner: target.isOwner, isProtected: target.role?.protected === true },
    { ownerCount: await activeOwnerCount(v.db) },
  );
  if (!result.ok) throw forbidden(result.reason);
  return target;
}

export const staffRoutes = new Hono<AppEnv>()
  .get('/', requirePermission('staff.view'), async (c) => {
    const rows = await c.var.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        status: users.status,
        createdAt: users.createdAt,
        roleId: roles.id,
        roleAr: roles.nameAr,
        roleEn: roles.nameEn,
        passkeys: sql<number>`(select count(*)::int from ${passkeys} where ${passkeys.userId} = ${users.id})`,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .orderBy(users.createdAt);
    return c.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        status: r.status,
        createdAt: r.createdAt,
        role: r.roleId ? { id: r.roleId, name: { ar: r.roleAr, en: r.roleEn } } : null,
        passkeys: r.passkeys,
      })),
    );
  })

  .get('/invitations', requirePermission('staff.view'), async (c) => {
    const rows = await c.var.db
      .select({
        id: invitations.id,
        email: invitations.email,
        name: invitations.name,
        roleId: invitations.roleId,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())));
    return c.json(rows);
  })

  .post(
    '/invitations',
    requirePermission('staff.manage'),
    validate(
      'json',
      z.strictObject({
        email: z.email().max(254),
        name: z.string().trim().max(80).default(''),
        roleId: z.string().min(1).max(64),
      }),
    ),
    async (c) => {
      const v = c.var;
      const body = c.req.valid('json');
      const email = body.email.toLowerCase();

      const role = await loadRoleShape(v.db, body.roleId);
      if (!role) throw badRequest('unknown-role');
      const allowed = checkRoleAssignment(actorOf(v), role);
      if (!allowed.ok) throw forbidden(allowed.reason, allowed.permissions ? { permissions: allowed.permissions } : undefined);

      const [existing] = await v.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
      if (existing) throw conflict('email-in-use');
      const [pending] = await v.db
        .select({ n: count() })
        .from(invitations)
        .where(
          and(
            sql`lower(${invitations.email}) = ${email}`,
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        );
      if ((pending?.n ?? 0) > 0) throw conflict('invitation-pending');

      const token = randomToken();
      const [invitation] = await v.db
        .insert(invitations)
        .values({
          email,
          name: body.name,
          roleId: role.id,
          tokenHash: await sha256Hex(token),
          invitedBy: v.access.userId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_HOURS * 3600 * 1000),
        })
        .returning({ id: invitations.id });

      // The token travels in the URL fragment, which browsers never send to servers.
      const link = `${c.env.APP_ORIGIN}/accept-invitation#token=${token}`;
      await v.deps.email(c.env).send({
        to: email,
        ...emailTemplates.invitation({
          inviter: v.access.name,
          roleAr: role.nameAr,
          roleEn: role.nameEn,
          link,
          hours: INVITATION_TTL_HOURS,
        }),
      });
      await writeAudit(
        v.db,
        auditActor(v),
        { action: 'staff.invitation.created', targetType: 'invitation', targetId: invitation?.id ?? '', details: { email: maskContact(email), roleId: role.id } },
        v.requestId,
      );
      await notifyOwners(c, {
        ar: `دعوة ${maskContact(email)} بدور «${role.nameAr}»`,
        en: `invited ${maskContact(email)} as ${role.nameEn}`,
      });
      return c.json({ id: invitation?.id }, 201);
    },
  )

  .delete('/invitations/:id', requirePermission('staff.manage'), async (c) => {
    const v = c.var;
    const [invitation] = await v.db.select().from(invitations).where(eq(invitations.id, c.req.param('id')));
    if (!invitation || invitation.acceptedAt || invitation.revokedAt) throw notFound();
    const role = await loadRoleShape(v.db, invitation.roleId);
    if (role?.protected && !v.access.permissions.has('staff.manageAdmins')) throw forbidden('protected-role');
    await v.db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, invitation.id));
    await writeAudit(v.db, auditActor(v), { action: 'staff.invitation.revoked', targetType: 'invitation', targetId: invitation.id }, v.requestId);
    return c.json({ ok: true });
  })

  .put(
    '/:userId/role',
    requirePermission('staff.manage'),
    validate('json', z.strictObject({ roleId: z.string().min(1).max(64) })),
    async (c) => {
      const v = c.var;
      const target = await guardTarget(v, c.req.param('userId'));
      const role = await loadRoleShape(v.db, c.req.valid('json').roleId);
      if (!role) throw badRequest('unknown-role');
      const allowed = checkRoleAssignment(actorOf(v), role);
      if (!allowed.ok) throw forbidden(allowed.reason, allowed.permissions ? { permissions: allowed.permissions } : undefined);

      await v.db
        .insert(userRoles)
        .values({ userId: target.userId, roleId: role.id, assignedBy: v.access.userId })
        .onConflictDoUpdate({ target: userRoles.userId, set: { roleId: role.id, assignedBy: v.access.userId, assignedAt: new Date() } });
      await writeAudit(
        v.db,
        auditActor(v),
        { action: 'staff.role.changed', targetType: 'user', targetId: target.userId, details: { from: target.roleId, to: role.id } },
        v.requestId,
      );
      await notifyOwners(c, {
        ar: `تغيير دور ${target.email} إلى «${role.nameAr}»`,
        en: `changed ${target.email}'s role to ${role.nameEn}`,
      });
      return c.json({ ok: true });
    },
  )

  .post('/:userId/disable', requirePermission('staff.manage'), async (c) => {
    const v = c.var;
    const target = await guardTarget(v, c.req.param('userId'));
    await v.db.update(users).set({ status: 'disabled', updatedAt: new Date() }).where(eq(users.id, target.userId));
    // Ends every session immediately.
    await v.db.delete(sessions).where(eq(sessions.userId, target.userId));
    await writeAudit(v.db, auditActor(v), { action: 'staff.disabled', targetType: 'user', targetId: target.userId }, v.requestId);
    await notifyOwners(c, { ar: `تعطيل حساب ${target.email}`, en: `disabled ${target.email}` });
    return c.json({ ok: true });
  })

  .post('/:userId/enable', requirePermission('staff.manage'), async (c) => {
    const v = c.var;
    const target = await guardTarget(v, c.req.param('userId'));
    await v.db.update(users).set({ status: 'active', updatedAt: new Date() }).where(eq(users.id, target.userId));
    await writeAudit(v.db, auditActor(v), { action: 'staff.enabled', targetType: 'user', targetId: target.userId }, v.requestId);
    await notifyOwners(c, { ar: `تفعيل حساب ${target.email}`, en: `re-enabled ${target.email}` });
    return c.json({ ok: true });
  });
