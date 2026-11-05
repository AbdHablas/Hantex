import {
  FIRST_SITE,
  documentVersions,
  roleAssignments,
  scheduledPublishes,
  sites,
} from '@hantex/db/worker';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueSchedules } from '../src/lib/scheduled-run';
import { createHarness, env, type Harness } from './harness';

/**
 * Scheduled publishing (D-054): what was scheduled is what goes live, at its time, through the
 * same checks as Publish changes, and only while the person who scheduled may still publish.
 */

let h: Harness;
let owner: string;
let editor: string;
const SITE = FIRST_SITE.key;
const json = async <T>(response: Response) => (await response.json()) as T;
const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
const base = `/api/sites/${SITE}`;

/** Saves a Coming Soon draft with a headline, giving the site one change to publish. */
async function change(headline: string) {
  const current = await json<{ draft: Record<string, unknown> }>(
    await h.request('GET', `${base}/documents/coming-soon`, { cookie: owner }),
  );
  const data = structuredClone(current.draft) as { headline: { ar: string; en: string } };
  data.headline = { ar: headline, en: headline };
  const saved = await h.request('PUT', `${base}/documents/coming-soon/draft`, {
    cookie: owner,
    body: data,
  });
  expect(saved.status, await saved.clone().text()).toBe(200);
}

const schedule = (runAt: string, cookie = owner) =>
  h.request('POST', `${base}/changes/schedule`, { cookie, body: { runAt } });
const status = async () =>
  json<{
    waiting: { id: string; status: string } | null;
    recent: { status: string; detail: string }[];
  }>(await h.request('GET', `${base}/changes/schedule`, { cookie: owner }));
const latestHeadline = async () => {
  const [site] = await h.db.select({ id: sites.id }).from(sites).where(eq(sites.key, SITE));
  const [row] = await h.db
    .select({ data: documentVersions.data })
    .from(documentVersions)
    .where(and(eq(documentVersions.siteId, site!.id), eq(documentVersions.kind, 'coming-soon')))
    .orderBy(desc(documentVersions.version))
    .limit(1);
  return (row?.data as { headline?: { en: string } } | undefined)?.headline?.en;
};
/** Makes the waiting schedule due now, as if its time had come. */
const makeDue = () =>
  h.db
    .update(scheduledPublishes)
    .set({ runAt: new Date(Date.now() - 1000) })
    .where(eq(scheduledPublishes.status, 'scheduled'));

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('sp-owner', [{ roleId: 'owner', site: null }]);
  editor = await h.staff('sp-editor', [{ roleId: 'editor', site: 'a' }]);
});
afterAll(() => h.close());

describe('scheduled publishing (D-054)', () => {
  it('schedules only within the allowed window, only once, and only for those who may publish', async () => {
    await change('Scheduled headline');
    expect((await schedule(inMinutes(2))).status).toBe(400);
    expect((await schedule(inMinutes(60 * 24 * 91))).status).toBe(400);
    expect((await schedule(inMinutes(30), editor)).status).toBe(403);
    const created = await schedule(inMinutes(30));
    expect(created.status, await created.clone().text()).toBe(201);
    expect((await schedule(inMinutes(40))).status).toBe(409);
    expect((await status()).waiting?.status).toBe('scheduled');
  });

  it('publishes exactly what was scheduled when its time comes, and starts a rebuild', async () => {
    const before = h.dispatched.length;
    // Not due yet: nothing happens.
    expect(await runDueSchedules(h.deps, env)).toEqual([]);
    await makeDue();
    const results = await runDueSchedules(h.deps, env);
    expect(results.map((r) => r.status)).toEqual(['published']);
    expect(await latestHeadline()).toBe('Scheduled headline');
    expect(h.dispatched.length).toBe(before + 1);
    // Runs once only.
    expect(await runDueSchedules(h.deps, env)).toEqual([]);
    expect((await status()).recent[0]).toMatchObject({ status: 'published', detail: '' });
  });

  it('publishes nothing if the changes were edited after scheduling', async () => {
    await change('Reviewed headline');
    expect((await schedule(inMinutes(30))).status).toBe(201);
    await change('Edited later');
    await makeDue();
    expect((await runDueSchedules(h.deps, env))[0]).toMatchObject({
      status: 'blocked',
      detail: 'changed-since-scheduled',
    });
    expect(await latestHeadline()).toBe('Scheduled headline');
  });

  it('publishes nothing if the person who scheduled may no longer publish', async () => {
    const lead = await h.staff('sp-lead', [{ roleId: 'administrator', site: 'a' }]);
    expect((await schedule(inMinutes(30), lead)).status).toBe(201);
    await h.db.delete(roleAssignments).where(eq(roleAssignments.userId, 'sp-lead'));
    await makeDue();
    expect((await runDueSchedules(h.deps, env))[0]).toMatchObject({
      status: 'blocked',
      detail: 'not-allowed',
    });
    expect(await latestHeadline()).toBe('Scheduled headline');
  });

  it('can be cancelled before its time', async () => {
    expect((await schedule(inMinutes(30))).status).toBe(201);
    expect((await h.request('DELETE', `${base}/changes/schedule`, { cookie: editor })).status).toBe(
      403,
    );
    expect((await h.request('DELETE', `${base}/changes/schedule`, { cookie: owner })).status).toBe(
      200,
    );
    expect((await status()).waiting).toBeNull();
    await makeDue();
    expect(await runDueSchedules(h.deps, env)).toEqual([]);
  });
});
