import { validate } from '../lib/validate';
import { emailChallenges, invitations, recoveryCodes, roles, users } from '@hantex/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { createTicket } from '../auth/tickets';
import type { AppEnv } from '../context';
import { maskContact, writeAudit } from '../lib/audit';
import { hmacHex, normalizeRecoveryCode, randomDigits, randomToken, sha256Hex, timingSafeEqual } from '../lib/crypto';
import { emailTemplates } from '../lib/email';
import { badRequest, tooManyRequests } from '../lib/errors';
import { consumeRateLimit } from '../lib/rate-limit';

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;

const clientIp = (header: string | undefined) => header ?? 'unknown';

/**
 * Public steps before a passkey exists: opening an invitation, and recovering access with an
 * emailed code plus a recovery code. Each ends with a short-lived enrolment ticket that is only
 * good for registering one passkey.
 */
export const enrolmentRoutes = new Hono<AppEnv>()
  .post('/invitation', validate('json', z.strictObject({ token: z.string().min(20).max(200) })), async (c) => {
    const db = c.var.db;
    const ip = clientIp(c.req.header('cf-connecting-ip'));
    if (!(await consumeRateLimit(db, `invite-open:${ip}`, 20, 10 * 60 * 1000))) throw tooManyRequests();

    const now = new Date();
    const [row] = await db
      .select({ invitation: invitations, roleNameAr: roles.nameAr, roleNameEn: roles.nameEn })
      .from(invitations)
      .innerJoin(roles, eq(roles.id, invitations.roleId))
      .where(
        and(
          eq(invitations.tokenHash, await sha256Hex(c.req.valid('json').token)),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      );
    if (!row) throw badRequest('invitation-invalid');

    // The future account id is fixed now and bound to the ticket.
    const { ticket, expiresAt } = await createTicket(db, {
      purpose: 'invitation',
      userId: randomToken(16),
      invitationId: row.invitation.id,
    });
    return c.json({
      email: row.invitation.email,
      name: row.invitation.name,
      role: { ar: row.roleNameAr, en: row.roleNameEn },
      ticket,
      ticketExpiresAt: expiresAt.toISOString(),
    });
  })

  .post(
    '/recovery/start',
    validate('json', z.strictObject({ email: z.email().max(254), turnstileToken: z.string().max(2048) })),
    async (c) => {
      const db = c.var.db;
      const { email, turnstileToken } = c.req.valid('json');
      const ip = clientIp(c.req.header('cf-connecting-ip'));
      if (!(await c.var.deps.turnstile(c.env).verify(turnstileToken, ip))) throw badRequest('captcha-failed');
      const normalized = email.toLowerCase();
      if (
        !(await consumeRateLimit(db, `recovery-start-ip:${ip}`, 5, 15 * 60 * 1000)) ||
        !(await consumeRateLimit(db, `recovery-start-email:${normalized}`, 3, 60 * 60 * 1000))
      ) {
        throw tooManyRequests();
      }

      const [user] = await db
        .select()
        .from(users)
        .where(and(sql`lower(${users.email}) = ${normalized}`, eq(users.status, 'active')));
      if (user) {
        const code = randomDigits(6);
        await db
          .update(emailChallenges)
          .set({ consumedAt: new Date() })
          .where(and(eq(emailChallenges.userId, user.id), isNull(emailChallenges.consumedAt)));
        await db.insert(emailChallenges).values({
          userId: user.id,
          codeHash: await hmacHex(c.env.TOKEN_HASH_SECRET, `${user.id}:${code}`),
          expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
        });
        await c.var.deps.email(c.env).send({ to: user.email, ...emailTemplates.recoveryCode({ code, minutes: 10 }) });
        await writeAudit(
          db,
          { userId: user.id, label: user.email },
          { action: 'auth.recovery.code-sent', targetType: 'user', targetId: user.id },
          c.var.requestId,
        );
      }
      // Same answer whether or not the address belongs to staff (no account enumeration).
      return c.json({ sent: true }, 202);
    },
  )

  .post(
    '/recovery/complete',
    validate(
      'json',
      z.strictObject({
        email: z.email().max(254),
        code: z.string().regex(/^\d{6}$/),
        recoveryCode: z.string().min(10).max(20),
        turnstileToken: z.string().max(2048),
      }),
    ),
    async (c) => {
      const db = c.var.db;
      const body = c.req.valid('json');
      const ip = clientIp(c.req.header('cf-connecting-ip'));
      if (!(await c.var.deps.turnstile(c.env).verify(body.turnstileToken, ip))) throw badRequest('captcha-failed');
      if (!(await consumeRateLimit(db, `recovery-complete-ip:${ip}`, 10, 15 * 60 * 1000))) throw tooManyRequests();

      const normalized = body.email.toLowerCase();
      const fail = async () => {
        await writeAudit(
          db,
          { userId: null, label: maskContact(normalized) },
          { action: 'auth.recovery.failed' },
          c.var.requestId,
        );
        return badRequest('recovery-failed');
      };

      const [user] = await db
        .select()
        .from(users)
        .where(and(sql`lower(${users.email}) = ${normalized}`, eq(users.status, 'active')));
      if (!user) throw await fail();

      const [challenge] = await db
        .update(emailChallenges)
        .set({ attempts: sql`${emailChallenges.attempts} + 1` })
        .where(
          and(
            eq(emailChallenges.userId, user.id),
            isNull(emailChallenges.consumedAt),
            gt(emailChallenges.expiresAt, new Date()),
            sql`${emailChallenges.attempts} < ${EMAIL_CODE_MAX_ATTEMPTS}`,
          ),
        )
        .returning();
      const expected = await hmacHex(c.env.TOKEN_HASH_SECRET, `${user.id}:${body.code}`);
      if (!challenge || !timingSafeEqual(challenge.codeHash, expected)) throw await fail();

      const codeHash = await hmacHex(c.env.TOKEN_HASH_SECRET, normalizeRecoveryCode(body.recoveryCode));
      const [usedCode] = await db
        .update(recoveryCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(recoveryCodes.userId, user.id), eq(recoveryCodes.codeHash, codeHash), isNull(recoveryCodes.usedAt)))
        .returning({ id: recoveryCodes.id });
      if (!usedCode) throw await fail();

      await db.update(emailChallenges).set({ consumedAt: new Date() }).where(eq(emailChallenges.id, challenge.id));
      const { ticket, expiresAt } = await createTicket(db, { purpose: 'recovery', userId: user.id });
      await writeAudit(
        db,
        { userId: user.id, label: user.email },
        { action: 'auth.recovery.verified', targetType: 'user', targetId: user.id },
        c.var.requestId,
      );
      return c.json({ ticket, ticketExpiresAt: expiresAt.toISOString() });
    },
  );
