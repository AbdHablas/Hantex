import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database } from './client';
import { invitations, roleAssignments, roles } from './schema';

export const SETUP_INVITATION_HOURS = 24;

/**
 * Creates the single-use, time-limited invitation for the first Owner
 * (docs/roles-and-permissions.md, "First Owner account"). No administrator account exists in
 * code: this is the only way in, and it stops working as soon as an Owner exists. Only the
 * token's SHA-256 hash is stored; the link is printed once for the person running the command.
 */
export async function createOwnerSetupInvitation(
  db: Database,
  input: { email: string; appOrigin: string; now?: Date },
): Promise<{ link: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email))
    throw new Error('Not a valid email address');
  const origin = new URL(input.appOrigin);
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
    throw new Error('The dashboard address must use https');
  }

  return db.transaction(async (tx) => {
    // Serialise concurrent runs.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('owner-setup'))`);
    const [owner] = await tx
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .where(eq(roles.locked, true))
      .limit(1);
    if (owner) throw new Error('An Owner already exists: invite people from the dashboard instead');

    // Any earlier unused setup invitation stops working.
    await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          isNull(invitations.invitedBy),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      );

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + SETUP_INVITATION_HOURS * 3600 * 1000);
    await tx.insert(invitations).values({
      email,
      roleId: 'owner',
      siteId: null,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      invitedBy: null,
      expiresAt,
    });
    return { link: `${origin.origin}/accept-invitation#token=${token}`, expiresAt };
  });
}
