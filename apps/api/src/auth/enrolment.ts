import { invitations, passkeys, sessions, userRoles, users, type Database } from '@hantex/db';
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
        const [invitation] = await db.select().from(invitations).where(pendingInvitation(ticket.invitationId, now));
        if (!invitation) throw reject('INVITATION_INVALID');
        return { id: ticket.userId, name: invitation.email, displayName: invitation.name || invitation.email };
      }

      const [user] = await db.select().from(users).where(and(eq(users.id, ticket.userId), eq(users.status, 'active')));
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
        if (!ticket.invitationId) throw reject('ENROLMENT_TICKET_INVALID');
        const [invitation] = await db
          .update(invitations)
          .set({ acceptedAt: now, acceptedUserId: ticket.userId })
          .where(pendingInvitation(ticket.invitationId, now))
          .returning();
        if (!invitation) throw reject('INVITATION_INVALID');

        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = lower(${invitation.email})`);
        if (existing) throw reject('EMAIL_ALREADY_REGISTERED');

        await db.insert(users).values({
          id: ticket.userId,
          name: invitation.name || invitation.email.split('@')[0] || invitation.email,
          email: invitation.email.toLowerCase(),
          emailVerified: true,
        });
        await db.insert(userRoles).values({
          userId: ticket.userId,
          roleId: invitation.roleId,
          assignedBy: invitation.invitedBy,
        });
        await writeAudit(
          db,
          { userId: ticket.userId, label: invitation.email },
          {
            action: invitation.invitedBy ? 'staff.invitation.accepted' : 'setup.owner.created',
            targetType: 'user',
            targetId: ticket.userId,
            details: { roleId: invitation.roleId },
          },
        );
        return { userId: ticket.userId };
      }

      // Recovery: a lost device may still be signed in, so end every existing session.
      await db.delete(sessions).where(eq(sessions.userId, ticket.userId));
      const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, ticket.userId));
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
