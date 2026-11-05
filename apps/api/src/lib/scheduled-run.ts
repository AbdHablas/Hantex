import { scheduledPublishes, sites } from '@hantex/db/worker';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { AppDeps } from '../context';
import type { Env } from '../env';
import { publishSiteChanges } from '../routes/builder';
import { coversSite, loadAccess, permissionsOn } from './access';
import { writeAudit } from './audit';
import { HttpError } from './errors';
import type { ChangeSnapshot } from './schedule';

/**
 * Runs the scheduled publishes that are due (D-054), from the dashboard Worker's cron trigger.
 * Each runs as the person who scheduled it, with their permissions as they are now: if they may
 * no longer publish on that site, or the site's changes are no longer exactly those scheduled,
 * nothing is published and the schedule says why. Publishing itself is Publish changes' own code,
 * with all its checks.
 */
export async function runDueSchedules(deps: AppDeps, env: Env, now = new Date()) {
  const { db, close } = await deps.connectDb(env);
  const results: { id: string; status: string; detail: string }[] = [];
  try {
    const due = await db
      .select()
      .from(scheduledPublishes)
      .where(and(eq(scheduledPublishes.status, 'scheduled'), lte(scheduledPublishes.runAt, now)))
      .orderBy(asc(scheduledPublishes.runAt))
      .limit(10);
    for (const schedule of due) {
      // Claimed by one run only, even if two cron runs overlap.
      const [claimed] = await db
        .update(scheduledPublishes)
        .set({ status: 'running' })
        .where(
          and(eq(scheduledPublishes.id, schedule.id), eq(scheduledPublishes.status, 'scheduled')),
        )
        .returning({ id: scheduledPublishes.id });
      if (!claimed) continue;

      let status: 'published' | 'blocked' | 'failed' = 'published';
      let detail = '';
      let actor = { userId: null as string | null, label: 'scheduled publishing' };
      try {
        const [site] = await db.select().from(sites).where(eq(sites.id, schedule.siteId));
        const access = schedule.createdBy ? await loadAccess(db, schedule.createdBy) : null;
        if (access) actor = { userId: access.userId, label: `${access.email} (scheduled)` };
        if (!site || site.archivedAt) {
          status = 'blocked';
          detail = 'site-archived';
        } else if (
          !access ||
          access.status !== 'active' ||
          !coversSite(access, site.id) ||
          !permissionsOn(access, site.id).has('site.publish')
        ) {
          status = 'blocked';
          detail = 'not-allowed';
        } else {
          await publishSiteChanges(
            {
              db,
              site: {
                id: site.id,
                key: site.key,
                nameAr: site.nameAr,
                nameEn: site.nameEn,
                locales: site.locales,
                defaultLocale: site.defaultLocale,
                mode: site.mode,
                template: site.template,
                archivedAt: site.archivedAt,
              },
              access,
              permissions: permissionsOn(access, site.id),
              deps,
              requestId: `scheduled:${schedule.id}`,
            },
            env,
            {
              expected: schedule.items as ChangeSnapshot,
              confirmLogoChange: schedule.confirmLogoChange,
            },
          );
        }
      } catch (error) {
        // Refusals (changed since scheduling, issues, nothing left) block; anything else fails.
        if (error instanceof HttpError && error.status < 500) {
          status = 'blocked';
          detail = error.code;
        } else {
          status = 'failed';
          detail = 'error';
          console.error(
            'scheduled publish failed',
            error instanceof Error ? error.name : 'unknown',
          );
        }
      }
      await db
        .update(scheduledPublishes)
        .set({ status, detail, finishedAt: new Date() })
        .where(eq(scheduledPublishes.id, schedule.id));
      await writeAudit(db, actor, {
        action: 'site.scheduled-publish-ran',
        siteId: schedule.siteId,
        targetType: 'schedule',
        targetId: schedule.id,
        details: { status, detail },
      });
      results.push({ id: schedule.id, status, detail });
    }
  } finally {
    await close();
  }
  return results;
}
