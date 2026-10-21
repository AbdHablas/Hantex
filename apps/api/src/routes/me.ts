import { validate } from '../lib/validate';
import { passkeys, recoveryCodes, sessions, sites, users } from '@hantex/db/worker';
import { LOCALES } from '@hantex/shared';
import { and, count, eq, isNull } from 'drizzle-orm';
import { coversSite, permissionsOn } from '../lib/access';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import { hmacHex, normalizeRecoveryCode, recoveryCode } from '../lib/crypto';
import { conflict, notFound } from '../lib/errors';
import { requireFreshSession } from '../middleware/session';

export const RECOVERY_CODE_COUNT = 10;

const actorOf = (c: { var: AppEnv['Variables'] }) => ({
  userId: c.var.access.userId,
  label: c.var.access.email,
});

export const meRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { access, db } = c.var;
    const [passkeyCount] = await db
      .select({ n: count() })
      .from(passkeys)
      .where(eq(passkeys.userId, access.userId));
    const [codesLeft] = await db
      .select({ n: count() })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, access.userId), isNull(recoveryCodes.usedAt)));
    const [profile] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, access.userId));
    // The sites this person can open, with their role and permissions on each (site switcher).
    const allSites = await db.select().from(sites).orderBy(sites.createdAt);
    const mySites = allSites
      .filter((site) => coversSite(access, site.id))
      .map((site) => {
        const assignment =
          access.assignments.find((a) => a.siteId === site.id) ??
          access.assignments.find((a) => a.siteId === null);
        return {
          key: site.key,
          name: { ar: site.nameAr, en: site.nameEn },
          mode: site.mode,
          archived: site.archivedAt !== null,
          role: assignment
            ? {
                id: assignment.role.id,
                name: { ar: assignment.role.nameAr, en: assignment.role.nameEn },
              }
            : null,
          permissions: [...permissionsOn(access, site.id)].sort(),
        };
      });
    return c.json({
      id: access.userId,
      name: access.name,
      email: access.email,
      locale: profile?.locale ?? 'ar',
      allSites: access.allSites,
      /** Permissions for the dashboard as a whole (all-sites roles only). */
      permissions: [...c.var.permissions].sort(),
      sites: mySites,
      passkeys: passkeyCount?.n ?? 0,
      recoveryCodesLeft: codesLeft?.n ?? 0,
    });
  })

  .patch(
    '/',
    validate(
      'json',
      z.strictObject({
        name: z.string().trim().min(1).max(80).optional(),
        locale: z.enum(LOCALES).optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      await c.var.db
        .update(users)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(users.id, c.var.access.userId));
      await writeAudit(
        c.var.db,
        actorOf(c),
        { action: 'profile.updated', details: { fields: Object.keys(body) } },
        c.var.requestId,
      );
      return c.json({ ok: true });
    },
  )

  .get('/passkeys', async (c) => {
    const rows = await c.var.db
      .select({
        id: passkeys.id,
        name: passkeys.name,
        createdAt: passkeys.createdAt,
        deviceType: passkeys.deviceType,
        backedUp: passkeys.backedUp,
      })
      .from(passkeys)
      .where(eq(passkeys.userId, c.var.access.userId));
    return c.json(rows);
  })

  .delete('/passkeys/:id', requireFreshSession, async (c) => {
    const { db, access } = c.var;
    const mine = await db
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(eq(passkeys.userId, access.userId));
    if (!mine.some((p) => p.id === c.req.param('id'))) throw notFound();
    // Removing the last passkey would lock the account out.
    if (mine.length <= 1) throw conflict('last-passkey');
    await db
      .delete(passkeys)
      .where(and(eq(passkeys.id, c.req.param('id')), eq(passkeys.userId, access.userId)));
    await writeAudit(
      db,
      actorOf(c),
      { action: 'auth.passkey.removed', targetType: 'passkey', targetId: c.req.param('id') },
      c.var.requestId,
    );
    return c.json({ ok: true });
  })

  /** Replaces all recovery codes; the new codes are shown once and stored only as keyed hashes. */
  .post('/recovery-codes', requireFreshSession, async (c) => {
    const { db, access } = c.var;
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
    const hashes = await Promise.all(
      codes.map((code) => hmacHex(c.env.TOKEN_HASH_SECRET, normalizeRecoveryCode(code))),
    );
    await db.transaction(async (tx) => {
      await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, access.userId));
      await tx
        .insert(recoveryCodes)
        .values(hashes.map((codeHash) => ({ userId: access.userId, codeHash })));
    });
    await writeAudit(
      db,
      actorOf(c),
      { action: 'auth.recovery-codes.regenerated' },
      c.var.requestId,
    );
    return c.json({ codes });
  })

  .post('/sign-out-everywhere', async (c) => {
    await c.var.db.delete(sessions).where(eq(sessions.userId, c.var.access.userId));
    await writeAudit(c.var.db, actorOf(c), { action: 'auth.sessions.revoked' }, c.var.requestId);
    return c.json({ ok: true });
  });
