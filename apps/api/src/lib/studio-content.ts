import {
  studioCaptureFiles,
  studioCaptures,
  studioJobs,
  studioProviderSettings,
  studioSpend,
  type Database,
} from '@hantex/db/worker';
import { eligibility, type CaptureSummary, type PhotoMeta } from '@hantex/studio';
import { and, eq, gte, sum } from 'drizzle-orm';

/**
 * Database-backed helpers for the 3D Product Studio (D-029, D-030, D-056): turning the rows for
 * one capture into the pure `CaptureSummary` the `@hantex/studio` checks work on, storage quota,
 * and the monthly budget a provider's jobs must stay within.
 */

/** Every file uploaded for a capture, and the summary `@hantex/studio`'s checks need. */
export async function captureSummary(
  db: Database,
  captureId: string,
): Promise<{ summary: CaptureSummary; files: (typeof studioCaptureFiles.$inferSelect)[] } | null> {
  const [capture] = await db.select().from(studioCaptures).where(eq(studioCaptures.id, captureId));
  if (!capture) return null;
  const files = await db
    .select()
    .from(studioCaptureFiles)
    .where(eq(studioCaptureFiles.captureId, captureId));
  const photos: PhotoMeta[] = files
    .filter((f) => f.kind === 'photo' && f.view)
    .map((f) => ({
      view: f.view as PhotoMeta['view'],
      widthPx: f.widthPx ?? 0,
      heightPx: f.heightPx ?? 0,
    }));
  const summary: CaptureSummary = {
    photos,
    hasCad: files.some((f) => f.kind === 'cad'),
    hasModel: files.some((f) => f.kind === 'model'),
    dimensionsMm:
      capture.widthMm !== null && capture.heightMm !== null && capture.depthMm !== null
        ? { width: capture.widthMm, height: capture.heightMm, depth: capture.depthMm }
        : null,
  };
  return { summary, files };
}

/** What methods a capture's uploads honestly allow right now. */
export async function captureEligibility(db: Database, captureId: string) {
  const data = await captureSummary(db, captureId);
  return data ? eligibility(data.summary) : null;
}

/** Bytes a website's 3D Studio captures use (photos, CAD and model uploads). */
export async function studioStoredBytes(db: Database, siteId: string): Promise<number> {
  const [row] = await db
    .select({ bytes: sum(studioCaptureFiles.bytes) })
    .from(studioCaptureFiles)
    .innerJoin(studioCaptures, eq(studioCaptures.id, studioCaptureFiles.captureId))
    .where(eq(studioCaptures.siteId, siteId));
  return Number(row?.bytes ?? 0);
}

/** The first moment of the current UTC month, when a provider's monthly budget resets. */
export function startOfBudgetMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** A provider's settings for a site: disabled (and so $0 budget) unless the Owner switched it on. */
export async function providerSettings(db: Database, siteId: string, providerId: string) {
  const [row] = await db
    .select()
    .from(studioProviderSettings)
    .where(
      and(
        eq(studioProviderSettings.siteId, siteId),
        eq(studioProviderSettings.providerId, providerId),
      ),
    );
  return row ?? { siteId, providerId, enabled: false, budgetCents: 0 };
}

/** What a provider has actually cost a site so far this UTC month. */
export async function spentThisMonth(
  db: Database,
  siteId: string,
  providerId: string,
  now = new Date(),
): Promise<number> {
  const [row] = await db
    .select({ cents: sum(studioSpend.cents) })
    .from(studioSpend)
    .where(
      and(
        eq(studioSpend.siteId, siteId),
        eq(studioSpend.providerId, providerId),
        gte(studioSpend.createdAt, startOfBudgetMonth(now)),
      ),
    );
  return Number(row?.cents ?? 0);
}

/** Every open job of a site, newest first (used to show progress and to block a second capture delete). */
export async function openJobsFor(db: Database, captureId: string) {
  return db
    .select()
    .from(studioJobs)
    .where(and(eq(studioJobs.captureId, captureId)));
}
