import { formRateLimits, type Database } from '@hantex/db';
import { sql } from 'drizzle-orm';

/**
 * Fixed-window rate limit stored in PostgreSQL, so it holds across Workers instances.
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
    .insert(formRateLimits)
    .values({ key, count: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: formRateLimits.key,
      set: {
        count: sql`case when ${formRateLimits.windowStartedAt} <= ${windowStart} then 1 else ${formRateLimits.count} + 1 end`,
        windowStartedAt: sql`case when ${formRateLimits.windowStartedAt} <= ${windowStart} then ${now} else ${formRateLimits.windowStartedAt} end`,
      },
    })
    .returning({ count: formRateLimits.count });
  return (row?.count ?? 1) <= limit;
}
