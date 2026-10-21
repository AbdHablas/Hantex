import { documentDrafts, publishJobs, subscribers } from '@hantex/db/worker';
import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../context';
import { KINDS, latestPublished } from '../lib/documents';
import { requirePermission } from '../middleware/session';

/** Aggregate figures only — no personal data — so every role with dashboard access can see them. */
export const overviewRoutes = new Hono<AppEnv>().get(
  '/',
  requirePermission('dashboard.view'),
  async (c) => {
    const db = c.var.db;
    const siteId = c.var.site.id;
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const ofSite = eq(subscribers.siteId, siteId);
    const [total] = await db.select({ n: count() }).from(subscribers).where(ofSite);
    const [recent] = await db
      .select({ n: count() })
      .from(subscribers)
      .where(and(ofSite, gt(subscribers.createdAt, weekAgo)));
    // Daily totals for the last 30 days (UTC) and the split by contact type: counts only.
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const day = sql<string>`to_char(date_trunc('day', ${subscribers.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
    const daily = await db
      .select({ day, n: count() })
      .from(subscribers)
      .where(and(ofSite, gt(subscribers.createdAt, monthAgo)))
      .groupBy(day)
      .orderBy(day);
    const byType = await db
      .select({ type: subscribers.contactType, n: count() })
      .from(subscribers)
      .where(ofSite)
      .groupBy(subscribers.contactType);
    const drafts = await db
      .select({ kind: documentDrafts.kind, updatedAt: documentDrafts.updatedAt })
      .from(documentDrafts)
      .where(eq(documentDrafts.siteId, siteId));
    const documents = Object.fromEntries(
      await Promise.all(
        KINDS.map(async (kind) => {
          const published = await latestPublished(db, siteId, kind);
          return [
            kind,
            {
              draftUpdatedAt: drafts.find((d) => d.kind === kind)?.updatedAt ?? null,
              published: published
                ? { version: published.version, publishedAt: published.publishedAt }
                : null,
            },
          ] as const;
        }),
      ),
    );
    const jobs = await db
      .select({
        id: publishJobs.id,
        status: publishJobs.status,
        requestedAt: publishJobs.requestedAt,
      })
      .from(publishJobs)
      .where(eq(publishJobs.siteId, siteId))
      .orderBy(desc(publishJobs.requestedAt))
      .limit(5);
    const s = c.var.site;
    return c.json({
      site: {
        key: s.key,
        name: { ar: s.nameAr, en: s.nameEn },
        mode: s.mode,
        archived: s.archivedAt !== null,
      },
      subscribers: {
        total: total?.n ?? 0,
        last7Days: recent?.n ?? 0,
        daily,
        byType: Object.fromEntries(byType.map((t) => [t.type, t.n])),
      },
      documents,
      jobs,
    });
  },
);
