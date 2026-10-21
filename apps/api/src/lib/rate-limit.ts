import { dashboardRateLimits, type Database } from '@hantex/db/worker';
import { sql } from 'drizzle-orm';

/**
 * Fixed-window rate limit for the dashboard's steps before sign-in, stored in PostgreSQL so it
 * holds across Workers instances.
 * Returns true when the request is allowed.
 */
export async function consumeRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  const windowStart = now - windowMs;
  const [row] = await db
    .insert(dashboardRateLimits)
    .values({ key, count: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: dashboardRateLimits.key,
      set: {
        count: sql`case when ${dashboardRateLimits.windowStartedAt} <= ${windowStart} then 1 else ${dashboardRateLimits.count} + 1 end`,
        windowStartedAt: sql`case when ${dashboardRateLimits.windowStartedAt} <= ${windowStart} then ${now} else ${dashboardRateLimits.windowStartedAt} end`,
      },
    })
    .returning({ count: dashboardRateLimits.count });
  return (row?.count ?? 1) <= limit;
}
