import { enrolmentTickets, type Database } from '@hantex/db/worker';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { randomToken, sha256Hex } from '../lib/crypto';

export const TICKET_TTL_MS = 10 * 60 * 1000;

export type TicketPurpose = 'invitation' | 'recovery';

/** Creates a single-use enrolment ticket; only its hash is stored. */
export async function createTicket(
  db: Database,
  input: { purpose: TicketPurpose; userId: string; invitationId?: string },
  now = new Date(),
): Promise<{ ticket: string; expiresAt: Date }> {
  const ticket = randomToken();
  const expiresAt = new Date(now.getTime() + TICKET_TTL_MS);
  await db.insert(enrolmentTickets).values({
    purpose: input.purpose,
    ticketHash: await sha256Hex(ticket),
    userId: input.userId,
    invitationId: input.invitationId ?? null,
    expiresAt,
  });
  return { ticket, expiresAt };
}

const valid = (hash: string, now: Date) =>
  and(
    eq(enrolmentTickets.ticketHash, hash),
    isNull(enrolmentTickets.usedAt),
    gt(enrolmentTickets.expiresAt, now),
  );

export async function findValidTicket(db: Database, ticket: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(enrolmentTickets)
    .where(valid(await sha256Hex(ticket), now));
  return row ?? null;
}

/** Marks a ticket used, atomically: of two concurrent attempts, only one succeeds. */
export async function consumeTicket(db: Database, ticket: string, now = new Date()) {
  const [row] = await db
    .update(enrolmentTickets)
    .set({ usedAt: now })
    .where(valid(await sha256Hex(ticket), now))
    .returning();
  return row ?? null;
}
