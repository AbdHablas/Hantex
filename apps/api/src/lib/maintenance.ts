import {
  authRateLimits,
  dashboardRateLimits,
  formRateLimits,
  type Database,
} from '@hantex/db/worker';
import { lt } from 'drizzle-orm';

/**
 * Rate-limit counters are only needed for their window (an hour at most, for enquiries); without
 * clean-up every new visitor address would add a row for ever, slowly filling the database (or
 * quickly, if someone floods the forms from many addresses). Counters older than a day are
 * deleted by the dashboard Worker's cron trigger.
 */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Deleted rows of a node-postgres query result (no RETURNING: the keys are never read). */
const deleted = (result: unknown) => (result as { rowCount?: number | null }).rowCount ?? 0;

export async function pruneRateLimits(db: Database, now = Date.now()) {
  const before = now - RATE_LIMIT_RETENTION_MS;
  const forms = await db.delete(formRateLimits).where(lt(formRateLimits.windowStartedAt, before));
  const dashboard = await db
    .delete(dashboardRateLimits)
    .where(lt(dashboardRateLimits.windowStartedAt, before));
  const auth = await db.delete(authRateLimits).where(lt(authRateLimits.lastRequest, before));
  return { forms: deleted(forms), dashboard: deleted(dashboard), auth: deleted(auth) };
}
