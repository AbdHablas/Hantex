import {
  invitations,
  passkeys,
  roleAssignments,
  roles,
  sessions,
  users,
  type Database,
} from '@hantex/db/worker';
import { APIError } from 'better-auth/api';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { writeAudit } from '../lib/audit';
import { consumeTicket, findValidTicket } from './tickets';

const reject = (message: string) => new APIError('UNAUTHORIZED', { message });

/** Passkeys must prove the person, not just the device (fingerprint, face or device PIN). */
export function requireUserVerified(userVerified: boolean | undefined): void {
  if (userVerified !== true) throw reject('USER_VERIFICATION_REQUIRED');
}

const pendingInvitation = (id: string, now: Date) =>
  and(
    eq(invitations.id, id),
    isNull(invitations.acceptedAt),
    isNull(invitations.revokedAt),
    gt(invitations.expiresAt, now),
  );

/**
 * Hooks for Better Auth's passkey plugin (registration.resolveUser / afterVerification and
 * authentication.afterVerification). Passkeys can be registered without a session only with a
 * valid enrolment ticket — from an invitation or from account recovery.
 */
export function enrolmentHooks(db: Database) {
  return {
    async resolveUser({ context }: { context?: string | null }) {
      if (!context) throw reject('ENROLMENT_TICKET_REQUIRED');
      const now = new Date();
      const ticket = await findValidTicket(db, context, now);
      if (!ticket) throw reject('ENROLMENT_TICKET_INVALID');

      if (ticket.purpose === 'invitation') {
        if (!ticket.invitationId) throw reject('ENROLMENT_TICKET_INVALID');
        const [invitation] = await db
          .select()
          .from(invitations)
          .where(pendingInvitation(ticket.invitationId, now));
        if (!invitation) throw reject('INVITATION_INVALID');
        return {
          id: ticket.userId,
          name: invitation.email,
          displayName: invitation.name || invitation.email,
        };
      }

      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, ticket.userId), eq(users.status, 'active')));
      if (!user) throw reject('ENROLMENT_TICKET_INVALID');
      return { id: user.id, name: user.email, displayName: user.name };
    },

    async afterRegistration({
      context,
      user,
      userVerified,
    }: {
      context?: string | null;
      user: { id: string };
      userVerified: boolean | undefined;
    }): Promise<{ userId: string } | undefined> {
      requireUserVerified(userVerified);
      // Signed-in staff adding another device: Better Auth already tied the passkey to the session.
      if (!context) return undefined;

      const now = new Date();
      const ticket = await consumeTicket(db, context, now);
      if (!ticket || ticket.userId !== user.id) throw reject('ENROLMENT_TICKET_INVALID');

      if (ticket.purpose === 'invitation') {
        const invitationId = ticket.invitationId;
        if (!invitationId) throw reject('ENROLMENT_TICKET_INVALID');
        // One transaction: the account, its role and the accepted invitation all exist, or none.
        const invitation = await db.transaction(async (tx) => {
          const [pending] = await tx
            .select()
            .from(invitations)
            .where(pendingInvitation(invitationId, now))
            .for('update');
          if (!pending) throw reject('INVITATION_INVALID');
          // The first-Owner setup invitation (no inviter) stops working once an Owner exists.
          if (!pending.invitedBy) {
            const [owner] = await tx
              .select({ id: roleAssignments.id })
              .from(roleAssignments)
              .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
              .where(eq(roles.locked, true))
              .limit(1);
            if (owner) throw reject('SETUP_CLOSED');
          }

          const [existing] = await tx
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.email}) = lower(${pending.email})`);
          if (existing) throw reject('EMAIL_ALREADY_REGISTERED');

          await tx.insert(users).values({
            id: ticket.userId,
            name: pending.name || pending.email.split('@')[0] || pending.email,
            email: pending.email.toLowerCase(),
            emailVerified: true,
          });
          await tx.insert(roleAssignments).values({
            userId: ticket.userId,
            roleId: pending.roleId,
            siteId: pending.siteId,
            assignedBy: pending.invitedBy,
          });
          await tx
            .update(invitations)
            .set({ acceptedAt: now, acceptedUserId: ticket.userId })
            .where(eq(invitations.id, pending.id));
          return pending;
        });
        await writeAudit(
          db,
          { userId: ticket.userId, label: invitation.email },
          {
            action: invitation.invitedBy ? 'staff.invitation.accepted' : 'setup.owner.created',
            siteId: invitation.siteId,
            targetType: 'user',
            targetId: ticket.userId,
            details: { roleId: invitation.roleId },
          },
        );
        return { userId: ticket.userId };
      }

      // Recovery: a lost device may still be signed in, so end every existing session.
      await db.delete(sessions).where(eq(sessions.userId, ticket.userId));
      const [owner] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, ticket.userId));
      await writeAudit(
        db,
        { userId: ticket.userId, label: owner?.email ?? ticket.userId },
        { action: 'auth.recovery.passkey-added', targetType: 'user', targetId: ticket.userId },
      );
      return { userId: ticket.userId };
    },

    async afterAuthentication({
      credentialId,
      userVerified,
    }: {
      credentialId: string;
      userVerified: boolean | undefined;
    }): Promise<void> {
      requireUserVerified(userVerified);
      const [row] = await db
        .select({ status: users.status })
        .from(passkeys)
        .innerJoin(users, eq(users.id, passkeys.userId))
        .where(eq(passkeys.credentialID, credentialId));
      if (row?.status !== 'active') throw reject('ACCOUNT_DISABLED');
    },
  };
}
