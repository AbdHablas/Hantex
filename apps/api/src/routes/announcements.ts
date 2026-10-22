import { announcementDeliveries, announcements, siteDomains, subscribers } from '@hantex/db/worker';
import { announcementLocale, announcementSchema, unsubscribeMessage } from '@hantex/shared';
import { and, count, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import { hmacHex } from '../lib/crypto';
import { emailTemplates } from '../lib/email';
import { conflict, notFound } from '../lib/errors';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/session';

/**
 * Announcements to a website's email sign-ups (D-040). An announcement is written once, then
 * sent in small chunks: each request sends at most CHUNK emails and never more than the daily
 * limit across all websites allows, so large lists are spread over days within the email
 * provider's plan. Every email links to a one-click unsubscribe page on the website itself.
 * WhatsApp numbers are not messaged from here; they are exported for manual sending.
 */

const CHUNK = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });
const idParam = validate('param', z.object({ id: z.uuid() }));

const dailyLimit = (env: AppEnv['Bindings']) => {
  const value = Number(env.ANNOUNCEMENT_DAILY_LIMIT ?? 100);
  return Number.isInteger(value) && value > 0 ? value : 100;
};

async function sentInLastDay(v: AppEnv['Variables']) {
  const [row] = await v.db
    .select({ n: count() })
    .from(announcementDeliveries)
    .where(
      and(
        eq(announcementDeliveries.status, 'sent'),
        gt(announcementDeliveries.sentAt, new Date(Date.now() - DAY_MS)),
      ),
    );
  return row?.n ?? 0;
}

async function primaryDomain(v: AppEnv['Variables']) {
  const [row] = await v.db
    .select({ hostname: siteDomains.hostname })
    .from(siteDomains)
    .where(
      and(
        eq(siteDomains.siteId, v.site.id),
        eq(siteDomains.isPrimary, true),
        ne(siteDomains.status, 'removed'),
      ),
    );
  return row?.hostname ?? null;
}

/** Email sign-ups of this site that this announcement hasn't reached yet. */
const pendingRecipients = (v: AppEnv['Variables']) =>
  and(
    eq(subscribers.siteId, v.site.id),
    eq(subscribers.contactType, 'email'),
    isNull(announcementDeliveries.subscriberId),
  );

export const announcementRoutes = new Hono<AppEnv>()
  .get('/', requirePermission('subscribers.announce'), async (c) => {
    const v = c.var;
    const rows = await v.db
      .select({
        id: announcements.id,
        content: announcements.content,
        status: announcements.status,
        createdAt: announcements.createdAt,
        finishedAt: announcements.finishedAt,
        sent: sql<number>`count(*) filter (where ${announcementDeliveries.status} = 'sent')`.mapWith(
          Number,
        ),
        failed:
          sql<number>`count(*) filter (where ${announcementDeliveries.status} = 'failed')`.mapWith(
            Number,
          ),
      })
      .from(announcements)
      .leftJoin(announcementDeliveries, eq(announcementDeliveries.announcementId, announcements.id))
      .where(eq(announcements.siteId, v.site.id))
      .groupBy(announcements.id)
      .orderBy(desc(announcements.createdAt))
      .limit(20);
    const [recipients] = await v.db
      .select({ n: count() })
      .from(subscribers)
      .where(and(eq(subscribers.siteId, v.site.id), eq(subscribers.contactType, 'email')));
    const limit = dailyLimit(c.env);
    return c.json({
      announcements: rows,
      recipients: recipients?.n ?? 0,
      dailyLimit: limit,
      sentToday: await sentInLastDay(v),
      hasDomain: (await primaryDomain(v)) !== null,
    });
  })

  .post(
    '/',
    requirePermission('subscribers.announce'),
    validate('json', announcementSchema),
    async (c) => {
      const v = c.var;
      // Unsubscribe links point at the website's own address.
      if (!(await primaryDomain(v))) throw conflict('site-has-no-domain');
      const [open] = await v.db
        .select({ id: announcements.id })
        .from(announcements)
        .where(and(eq(announcements.siteId, v.site.id), eq(announcements.status, 'sending')));
      if (open) throw conflict('announcement-in-progress');
      const [created] = await v.db
        .insert(announcements)
        .values({ siteId: v.site.id, content: c.req.valid('json'), createdBy: v.access.userId })
        .returning({ id: announcements.id });
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'announcement.created',
          siteId: v.site.id,
          targetType: 'announcement',
          targetId: created!.id,
        },
        v.requestId,
      );
      return c.json({ id: created!.id }, 201);
    },
  )

  /** Sends the next chunk; the dashboard calls it again until everyone is reached. */
  .post('/:id/send', requirePermission('subscribers.announce'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const [announcement] = await v.db
      .select()
      .from(announcements)
      .where(and(eq(announcements.id, id), eq(announcements.siteId, v.site.id)));
    if (!announcement) throw notFound();
    if (announcement.status !== 'sending') throw conflict('announcement-finished');
    const domain = await primaryDomain(v);
    if (!domain) throw conflict('site-has-no-domain');
    const content = announcementSchema.parse(announcement.content);

    const allowance = dailyLimit(c.env) - (await sentInLastDay(v));
    const remainingBefore = async () =>
      (
        await v.db
          .select({ n: count() })
          .from(subscribers)
          .leftJoin(
            announcementDeliveries,
            and(
              eq(announcementDeliveries.subscriberId, subscribers.id),
              eq(announcementDeliveries.announcementId, id),
            ),
          )
          .where(pendingRecipients(v))
      )[0]?.n ?? 0;
    if (allowance <= 0) {
      return c.json({
        sent: 0,
        failed: 0,
        remaining: await remainingBefore(),
        limitReached: true,
        finished: false,
      });
    }

    const batch = await v.db
      .select({ id: subscribers.id, email: subscribers.contactValue, locale: subscribers.locale })
      .from(subscribers)
      .leftJoin(
        announcementDeliveries,
        and(
          eq(announcementDeliveries.subscriberId, subscribers.id),
          eq(announcementDeliveries.announcementId, id),
        ),
      )
      .where(pendingRecipients(v))
      .orderBy(subscribers.createdAt)
      .limit(Math.min(CHUNK, allowance));

    const mailer = v.deps.email(c.env);
    let sent = 0;
    let failed = 0;
    for (const recipient of batch) {
      const lang = announcementLocale(content, recipient.locale);
      const token = await hmacHex(
        c.env.UNSUBSCRIBE_SECRET,
        unsubscribeMessage(v.site.id, recipient.id),
      );
      const unsubscribeUrl = `https://${domain}/unsubscribe?s=${recipient.id}&t=${token}`;
      const message = emailTemplates.announcement({
        lang,
        subject: content.subject[lang],
        body: content.body[lang],
        siteName: lang === 'ar' ? v.site.nameAr : v.site.nameEn,
        unsubscribeUrl,
      });
      let status: 'sent' | 'failed' = 'sent';
      try {
        await mailer.send({
          ...message,
          to: recipient.email,
          // One-click unsubscribe in mail apps (RFC 8058).
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        sent++;
      } catch {
        status = 'failed';
        failed++;
      }
      await v.db
        .insert(announcementDeliveries)
        .values({ announcementId: id, subscriberId: recipient.id, status })
        .onConflictDoNothing();
    }

    const remaining = await remainingBefore();
    const finished = remaining === 0;
    if (finished) {
      await v.db
        .update(announcements)
        .set({ status: 'finished', finishedAt: new Date() })
        .where(eq(announcements.id, id));
    }
    if (batch.length > 0) {
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'announcement.sent',
          siteId: v.site.id,
          targetType: 'announcement',
          targetId: id,
          details: { sent, failed, remaining },
        },
        v.requestId,
      );
    }
    return c.json({ sent, failed, remaining, limitReached: false, finished });
  })

  .post('/:id/cancel', requirePermission('subscribers.announce'), idParam, async (c) => {
    const v = c.var;
    const { id } = c.req.valid('param');
    const [updated] = await v.db
      .update(announcements)
      .set({ status: 'cancelled', finishedAt: new Date() })
      .where(
        and(
          eq(announcements.id, id),
          eq(announcements.siteId, v.site.id),
          eq(announcements.status, 'sending'),
        ),
      )
      .returning({ id: announcements.id });
    if (!updated) throw notFound();
    await writeAudit(
      v.db,
      auditActor(v),
      {
        action: 'announcement.cancelled',
        siteId: v.site.id,
        targetType: 'announcement',
        targetId: id,
      },
      v.requestId,
    );
    return c.json({ ok: true });
  });
