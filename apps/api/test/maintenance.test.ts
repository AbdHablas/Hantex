import { authRateLimits, dashboardRateLimits, formRateLimits, sites } from '@hantex/db/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pruneRateLimits, RATE_LIMIT_RETENTION_MS } from '../src/lib/maintenance';
import { createHarness, type Harness } from './harness';
import { createPoolDb } from '@hantex/db/client';
import { inject } from 'vitest';

let h: Harness;
let app: ReturnType<typeof createPoolDb>;

beforeAll(async () => {
  h = await createHarness();
  // As the dashboard's own database user, exactly as the cron trigger runs.
  const url = new URL(inject('databaseUrl'));
  url.username = 'hantex_admin_app';
  url.password = inject('rolePasswords')['hantex_admin_app'] ?? '';
  app = createPoolDb(url.toString(), 1);
});
afterAll(async () => {
  await app.close();
  await h.close();
});

describe('rate-limit clean-up', () => {
  it('deletes counters older than a day and keeps current ones', async () => {
    const now = Date.now();
    const old = now - RATE_LIMIT_RETENTION_MS - 60_000;
    const [site] = await h.db.select({ id: sites.id }).from(sites).limit(1);
    await h.db.insert(formRateLimits).values([
      { siteId: site!.id, key: 'prune:old', count: 3, windowStartedAt: old },
      { siteId: site!.id, key: 'prune:new', count: 1, windowStartedAt: now },
    ]);
    await h.db.insert(dashboardRateLimits).values([
      { key: 'prune:old', count: 3, windowStartedAt: old },
      { key: 'prune:new', count: 1, windowStartedAt: now },
    ]);
    await h.db.insert(authRateLimits).values([
      { id: 'prune-old', key: 'prune:old', count: 3, lastRequest: old },
      { id: 'prune-new', key: 'prune:new', count: 1, lastRequest: now },
    ]);
    expect(await pruneRateLimits(app.db, now)).toEqual({ forms: 1, dashboard: 1, auth: 1 });
    const keys = async (
      table: typeof formRateLimits | typeof dashboardRateLimits | typeof authRateLimits,
    ) =>
      (await h.db.select({ key: table.key }).from(table))
        .map((r) => r.key)
        .filter((k) => k.startsWith('prune:'));
    expect(await keys(formRateLimits)).toEqual(['prune:new']);
    expect(await keys(dashboardRateLimits)).toEqual(['prune:new']);
    expect(await keys(authRateLimits)).toEqual(['prune:new']);
  });
});
