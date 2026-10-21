import { documentDrafts, publishJobs, subscribers } from '@hantex/db';
import { count, desc, gt } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../context';
import { KINDS, latestPublished } from '../lib/documents';
import { requirePermission } from '../middleware/session';

/** Aggregate figures only — no personal data — so every role with dashboard access can see them. */
export const overviewRoutes = new Hono<AppEnv>().get('/', requirePermission('dashboard.view'), async (c) => {
  const db = c.var.db;
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [total] = await db.select({ n: count() }).from(subscribers);
  const [recent] = await db.select({ n: count() }).from(subscribers).where(gt(subscribers.createdAt, weekAgo));
  const drafts = await db.select({ kind: documentDrafts.kind, updatedAt: documentDrafts.updatedAt }).from(documentDrafts);
  const documents = Object.fromEntries(
    await Promise.all(
      KINDS.map(async (kind) => {
        const published = await latestPublished(db, kind);
        return [
          kind,
          {
            draftUpdatedAt: drafts.find((d) => d.kind === kind)?.updatedAt ?? null,
            published: published ? { version: published.version, publishedAt: published.publishedAt } : null,
          },
        ] as const;
      }),
    ),
  );
  const jobs = await db
    .select({ id: publishJobs.id, status: publishJobs.status, requestedAt: publishJobs.requestedAt })
    .from(publishJobs)
    .orderBy(desc(publishJobs.requestedAt))
    .limit(5);
  return c.json({ subscribers: { total: total?.n ?? 0, last7Days: recent?.n ?? 0 }, documents, jobs });
});
