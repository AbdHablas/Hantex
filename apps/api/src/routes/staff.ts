import {
  invitations,
  passkeys,
  roleAssignments,
  roles,
  sessions,
  sites,
  users,
  type Database,
} from '@hantex/db/worker';
import { checkAssignmentScope, checkRoleAssignment, checkStaffChange } from '@hantex/shared';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { loadAccess, type Access } from '../lib/access';
import { maskContact, writeAudit } from '../lib/audit';
import { randomToken, sha256Hex } from '../lib/crypto';
import { emailTemplates } from '../lib/email';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { activeOwnerCount, loadRoleShape, notifyOwners } from '../lib/staff';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/session';

export const INVITATION_TTL_HOURS = 72;

type Vars = AppEnv['Variables'];

const actorOf = (v: Vars) => ({ userId: v.access.userId, permissions: v.permissions });
const auditActor = (v: Vars) => ({ userId: v.access.userId, label: v.access.email });
const deny = (result: { reason: string; permissions?: string[] }) =>
  forbidden(result.reason, result.permissions ? { permissions: result.permissions } : undefined);

const roleBody = z.strictObject({ roleId: z.string().min(1).max(64) });
const inviteBody = z.strictObject({
  email: z.email().max(254),
  name: z.string().trim().max(80).default(''),
  roleId: z.string().min(1).max(64),
});

/** Checks a change to another person against the escalation rules (D-019, D-025). */
async function guardTarget(v: Vars, targetUserId: string): Promise<Access> {
  const target = await loadAccess(v.db, targetUserId);
  if (!target) throw notFound();
  const result = checkStaffChange(
    actorOf(v),
    { userId: target.userId, isOwner: target.isOwner, isProtected: target.isProtected },
    { ownerCount: await activeOwnerCount(v.db) },
  );
  if (!result.ok) throw deny(result);
  return target;
}

const pendingInvitations = () =>
  and(
    isNull(invitations.acceptedAt),
    isNull(invitations.revokedAt),
    gt(invitations.expiresAt, new Date()),
  );

/** Creates an invitation for one site, or for all sites when siteId is null. */
async function invite(
  c: Context<AppEnv>,
  body: z.infer<typeof inviteBody>,
  site: { id: string; nameAr: string; nameEn: string } | null,
) {
  const v = c.var;
  const email = body.email.toLowerCase();
  const role = await loadRoleShape(v.db, body.roleId);
  if (!role) throw badRequest('unknown-role');
  const allowed = checkRoleAssignment(actorOf(v), role);
  if (!allowed.ok) throw deny(allowed);
  const scope = checkAssignmentScope(
    { roleId: role.id, siteId: site?.id ?? null, roleLocked: role.locked },
    [],
    v.access.allSites,
  );
  if (!scope.ok) throw forbidden(scope.reason);

  const [existing] = await v.db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  if (existing) throw conflict('email-in-use');
  const [pending] = await v.db
    .select({ n: count() })
    .from(invitations)
    .where(and(sql`lower(${invitations.email}) = ${email}`, pendingInvitations()));
  if ((pending?.n ?? 0) > 0) throw conflict('invitation-pending');

  const token = randomToken();
  const [invitation] = await v.db
    .insert(invitations)
    .values({
      email,
      name: body.name,
      roleId: role.id,
      siteId: site?.id ?? null,
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
      siteAr: site?.nameAr ?? null,
      siteEn: site?.nameEn ?? null,
      link,
      hours: INVITATION_TTL_HOURS,
    }),
  });
  await writeAudit(
    v.db,
    auditActor(v),
    {
      action: 'staff.invitation.created',
      siteId: site?.id ?? null,
      targetType: 'invitation',
      targetId: invitation?.id ?? '',
      details: { email: maskContact(email), roleId: role.id },
    },
    v.requestId,
  );
  const where = site
    ? { ar: ` في «${site.nameAr}»`, en: ` on ${site.nameEn}` }
    : { ar: ' لكل المواقع', en: ' for all sites' };
  await notifyOwners(c, {
    ar: `دعوة ${maskContact(email)} بدور «${role.nameAr}»${where.ar}`,
    en: `invited ${maskContact(email)} as ${role.nameEn}${where.en}`,
  });
  return c.json({ id: invitation?.id }, 201);
}

async function revokeInvitation(c: Context<AppEnv>, siteId: string | null | undefined) {
  const v = c.var;
  const [invitation] = await v.db
    .select()
    .from(invitations)
    .where(eq(invitations.id, c.req.param('id') ?? ''));
  // On a site's routes, only that site's invitations are visible.
  if (!invitation || invitation.acceptedAt || invitation.revokedAt) throw notFound();
  if (siteId !== undefined && invitation.siteId !== siteId) throw notFound();
  const role = await loadRoleShape(v.db, invitation.roleId);
  if (role?.protected && !v.permissions.has('staff.manageAdmins'))
    throw forbidden('protected-role');
  await v.db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(eq(invitations.id, invitation.id));
  await writeAudit(
    v.db,
    auditActor(v),
    {
      action: 'staff.invitation.revoked',
      siteId: invitation.siteId,
      targetType: 'invitation',
      targetId: invitation.id,
    },
    v.requestId,
  );
  return c.json({ ok: true });
}

const passkeyCount = sql<number>`(select count(*)::int from ${passkeys} where ${passkeys.userId} = ${users.id})`;

async function staffRows(db: Database) {
  const people = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      createdAt: users.createdAt,
      passkeys: passkeyCount,
    })
    .from(users)
    .orderBy(users.createdAt);
  const assigned = await db
    .select({
      userId: roleAssignments.userId,
      roleId: roles.id,
      roleAr: roles.nameAr,
      roleEn: roles.nameEn,
      siteKey: sites.key,
    })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .leftJoin(sites, eq(sites.id, roleAssignments.siteId));
  return { people, assigned };
}

/**
 * Platform staff routes (all-sites staff): every account, all-sites roles, and account-wide
 * actions (disable, enable), which affect every site the person works on.
 */
export const staffRoutes = new Hono<AppEnv>()
  .get('/', requirePermission('staff.view'), async (c) => {
    const { people, assigned } = await staffRows(c.var.db);
    return c.json(
      people.map((p) => ({
        ...p,
        roles: assigned
          .filter((a) => a.userId === p.id)
          .map((a) => ({
            site: a.siteKey ?? null,
            role: { id: a.roleId, name: { ar: a.roleAr, en: a.roleEn } },
          })),
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
        site: sites.key,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .leftJoin(sites, eq(sites.id, invitations.siteId))
      .where(pendingInvitations());
    return c.json(rows);
  })

  /** Invites someone with a role on all sites. Per-site invitations use the site's routes. */
  .post('/invitations', requirePermission('staff.manage'), validate('json', inviteBody), (c) =>
    invite(c, c.req.valid('json'), null),
  )

  .delete('/invitations/:id', requirePermission('staff.manage'), (c) =>
    revokeInvitation(c, undefined),
  )

  /** Gives someone one role on all sites, replacing any per-site roles they had. */
  .put(
    '/:userId/role',
    requirePermission('staff.manage'),
    validate('json', roleBody),
    async (c) => {
      const v = c.var;
      const target = await guardTarget(v, c.req.param('userId'));
      const role = await loadRoleShape(v.db, c.req.valid('json').roleId);
      if (!role) throw badRequest('unknown-role');
      const allowed = checkRoleAssignment(actorOf(v), role);
      if (!allowed.ok) throw deny(allowed);
      const before = target.assignments.map((a) => ({ roleId: a.roleId, siteId: a.siteId }));
      await v.db.transaction(async (tx) => {
        await tx.delete(roleAssignments).where(eq(roleAssignments.userId, target.userId));
        await tx.insert(roleAssignments).values({
          userId: target.userId,
          roleId: role.id,
          siteId: null,
          assignedBy: v.access.userId,
        });
      });
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'staff.role.changed',
          targetType: 'user',
          targetId: target.userId,
          details: { before, after: [{ roleId: role.id, siteId: null }] },
        },
        v.requestId,
      );
      await notifyOwners(c, {
        ar: `تغيير دور ${target.email} إلى «${role.nameAr}» لكل المواقع`,
        en: `changed ${target.email}'s role to ${role.nameEn} on all sites`,
      });
      return c.json({ ok: true });
    },
  )

  .post('/:userId/disable', requirePermission('staff.manage'), async (c) => {
    const v = c.var;
    const target = await guardTarget(v, c.req.param('userId'));
    await v.db
      .update(users)
      .set({ status: 'disabled', updatedAt: new Date() })
      .where(eq(users.id, target.userId));
    // Ends every session immediately.
    await v.db.delete(sessions).where(eq(sessions.userId, target.userId));
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'staff.disabled', targetType: 'user', targetId: target.userId },
      v.requestId,
    );
    await notifyOwners(c, { ar: `تعطيل حساب ${target.email}`, en: `disabled ${target.email}` });
    return c.json({ ok: true });
  })

  .post('/:userId/enable', requirePermission('staff.manage'), async (c) => {
    const v = c.var;
    const target = await guardTarget(v, c.req.param('userId'));
    await v.db
      .update(users)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(users.id, target.userId));
    await writeAudit(
      v.db,
      auditActor(v),
      { action: 'staff.enabled', targetType: 'user', targetId: target.userId },
      v.requestId,
    );
    await notifyOwners(c, { ar: `تفعيل حساب ${target.email}`, en: `re-enabled ${target.email}` });
    return c.json({ ok: true });
  });

/**
 * One site's staff (D-025): who works on this site and in which role. All-sites staff are listed
 * too, but their roles can only be changed from the platform staff routes.
 */
export const siteStaffRoutes = new Hono<AppEnv>()
  .get('/', requirePermission('staff.view'), async (c) => {
    const siteId = c.var.site.id;
    const { people, assigned } = await staffRows(c.var.db);
    const here = await c.var.db
      .select({ userId: roleAssignments.userId, siteId: roleAssignments.siteId })
      .from(roleAssignments)
      .where(sql`${roleAssignments.siteId} is null or ${roleAssignments.siteId} = ${siteId}`);
    return c.json(
      people.flatMap((p) => {
        const mine = here.find((h) => h.userId === p.id);
        if (!mine) return [];
        const role = assigned.find(
          (a) => a.userId === p.id && (a.siteKey === c.var.site.key || a.siteKey === null),
        );
        return [
          {
            ...p,
            allSites: mine.siteId === null,
            role: role ? { id: role.roleId, name: { ar: role.roleAr, en: role.roleEn } } : null,
          },
        ];
      }),
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
      .where(and(eq(invitations.siteId, c.var.site.id), pendingInvitations()));
    return c.json(rows);
  })

  .post('/invitations', requirePermission('staff.manage'), validate('json', inviteBody), (c) =>
    invite(c, c.req.valid('json'), c.var.site),
  )

  .delete('/invitations/:id', requirePermission('staff.manage'), (c) =>
    revokeInvitation(c, c.var.site.id),
  )

  /** Gives an existing staff member a role on this site, or changes it. */
  .put(
    '/:userId/role',
    requirePermission('staff.manage'),
    validate('json', roleBody),
    async (c) => {
      const v = c.var;
      const target = await guardTarget(v, c.req.param('userId'));
      const role = await loadRoleShape(v.db, c.req.valid('json').roleId);
      if (!role) throw badRequest('unknown-role');
      const allowed = checkRoleAssignment(actorOf(v), role);
      if (!allowed.ok) throw deny(allowed);
      const others = target.assignments.filter((a) => a.siteId !== v.site.id);
      const scope = checkAssignmentScope(
        { roleId: role.id, siteId: v.site.id, roleLocked: role.locked },
        others,
        v.access.allSites,
      );
      if (!scope.ok) throw forbidden(scope.reason);
      const before = target.assignments.find((a) => a.siteId === v.site.id)?.roleId ?? null;
      await v.db
        .insert(roleAssignments)
        .values({
          userId: target.userId,
          roleId: role.id,
          siteId: v.site.id,
          assignedBy: v.access.userId,
        })
        .onConflictDoUpdate({
          target: [roleAssignments.userId, roleAssignments.siteId],
          set: { roleId: role.id, assignedBy: v.access.userId, assignedAt: new Date() },
        });
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'staff.role.changed',
          siteId: v.site.id,
          targetType: 'user',
          targetId: target.userId,
          details: { from: before, to: role.id },
        },
        v.requestId,
      );
      await notifyOwners(c, {
        ar: `تغيير دور ${target.email} في «${v.site.nameAr}» إلى «${role.nameAr}»`,
        en: `changed ${target.email}'s role on ${v.site.nameEn} to ${role.nameEn}`,
      });
      return c.json({ ok: true });
    },
  )

  /** Removes a staff member's access to this site (their account and other sites are kept). */
  .delete('/:userId/role', requirePermission('staff.manage'), async (c) => {
    const v = c.var;
    const target = await guardTarget(v, c.req.param('userId'));
    const current = target.assignments.find((a) => a.siteId === v.site.id);
    if (!current) {
      if (target.allSites) throw conflict('all-sites-role');
      throw notFound();
    }
    await v.db
      .delete(roleAssignments)
      .where(and(eq(roleAssignments.userId, target.userId), eq(roleAssignments.siteId, v.site.id)));
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'staff.role.removed',
        siteId: v.site.id,
        targetType: 'user',
        targetId: target.userId,
        details: { roleId: current.roleId },
      },
      v.requestId,
    );
    await notifyOwners(c, {
      ar: `إزالة وصول ${target.email} إلى «${v.site.nameAr}»`,
      en: `removed ${target.email}'s access to ${v.site.nameEn}`,
    });
    return c.json({ ok: true });
  });
