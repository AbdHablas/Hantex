import { announcementDeliveries, subscribers } from '@hantex/db/worker';
import { unsubscribeMessage } from '@hantex/shared';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, env, type Harness } from './harness';

/**
 * Announcements to email sign-ups (D-040): written once, sent in chunks within the daily limit,
 * each email with a signed one-click unsubscribe link; WhatsApp numbers are exported instead.
 */

let h: Harness;
let owner: string;
let sales: string;
const SITE = 'hantex-ultra';
const path = (suffix = '') => `/api/sites/${SITE}/announcements${suffix}`;
const json = async <T>(response: Response) => (await response.json()) as T;
const content = {
  subject: { ar: 'لقد أطلقنا', en: 'We have launched' },
  body: { ar: 'السطر الأول\nالسطر الثاني', en: 'First line\nSecond line' },
};

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('an-owner', [{ roleId: 'owner', site: null }]);
  sales = await h.staff('an-sales', [{ roleId: 'sales', site: null }]);
  // 25 email sign-ups (half in English) and 3 WhatsApp numbers on the first site.
  await h.db.insert(subscribers).values([
    ...Array.from({ length: 25 }, (_, i) => ({
      siteId: h.sites.a,
      contactType: 'email',
      contactValue: `person${i}@example.test`,
      locale: i % 2 === 0 ? 'ar' : 'en',
      consentVersion: 'signup-consent-v1',
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      siteId: h.sites.a,
      contactType: 'whatsapp',
      contactValue: `+96393300000${i}`,
      locale: 'ar',
      consentVersion: 'signup-consent-v1',
    })),
  ]);
  env.ANNOUNCEMENT_DAILY_LIMIT = '22';
});
afterAll(async () => {
  delete env.ANNOUNCEMENT_DAILY_LIMIT;
  await h.close();
});

describe('announcements', () => {
  it('are only for those allowed to announce', async () => {
    expect((await h.request('GET', path(), { cookie: sales })).status).toBe(403);
    expect((await h.request('POST', path(), { cookie: sales, body: content })).status).toBe(403);
  });

  it('refuse half-written content', async () => {
    const half = { ...content, body: { ar: content.body.ar, en: '' } };
    expect((await h.request('POST', path(), { cookie: owner, body: half })).status).toBe(400);
  });

  it('send in chunks, in each subscriber’s language, within the daily limit', async () => {
    const created = await h.request('POST', path(), { cookie: owner, body: content });
    expect(created.status).toBe(201);
    const { id } = await json<{ id: string }>(created);
    // Only one announcement at a time per site.
    expect((await h.request('POST', path(), { cookie: owner, body: content })).status).toBe(409);

    h.mail.sent.length = 0;
    const first = await json<{ sent: number; remaining: number; finished: boolean }>(
      await h.request('POST', path(`/${id}/send`), { cookie: owner }),
    );
    expect(first).toMatchObject({ sent: 20, remaining: 5, finished: false });
    // The daily limit (22) leaves room for 2 more today.
    const second = await json<{ sent: number; remaining: number; limitReached: boolean }>(
      await h.request('POST', path(`/${id}/send`), { cookie: owner }),
    );
    expect(second).toMatchObject({ sent: 2, remaining: 3 });
    const third = await json<{ sent: number; limitReached: boolean }>(
      await h.request('POST', path(`/${id}/send`), { cookie: owner }),
    );
    expect(third).toMatchObject({ sent: 0, limitReached: true });
    expect(h.mail.sent).toHaveLength(22);
    // WhatsApp numbers are never emailed, and nobody gets the same announcement twice.
    expect(new Set(h.mail.sent.map((m) => m.to)).size).toBe(22);
    expect(h.mail.sent.every((m) => m.to.endsWith('@example.test'))).toBe(true);

    const english = h.mail.sent.find((m) => m.to === 'person1@example.test')!;
    expect(english.subject).toBe('We have launched');
    expect(english.text).toContain('Second line');
    const arabic = h.mail.sent.find((m) => m.to === 'person0@example.test')!;
    expect(arabic.subject).toBe('لقد أطلقنا');
    expect(arabic.html).toContain('dir="rtl"');

    // A signed one-click unsubscribe link that the site Worker can check.
    const header = english.headers?.['List-Unsubscribe'] ?? '';
    const url = new URL(header.slice(1, -1));
    expect(url.origin + url.pathname).toBe('https://www.hantexultra.com/unsubscribe');
    const subscriberId = url.searchParams.get('s')!;
    const expected = createHmac('sha256', 'test-unsubscribe-secret')
      .update(unsubscribeMessage(h.sites.a, subscriberId))
      .digest('hex');
    expect(url.searchParams.get('t')).toBe(expected);
    expect(english.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(english.text).toContain(url.toString());

    // Next day: the rest go out and the announcement finishes.
    await h.db
      .update(announcementDeliveries)
      .set({ sentAt: new Date(Date.now() - 2 * 86_400_000) });
    const last = await json<{ sent: number; remaining: number; finished: boolean }>(
      await h.request('POST', path(`/${id}/send`), { cookie: owner }),
    );
    expect(last).toMatchObject({ sent: 3, remaining: 0, finished: true });
    const list = await json<{ announcements: { status: string; sent: number }[] }>(
      await h.request('GET', path(), { cookie: owner }),
    );
    expect(list.announcements[0]).toMatchObject({ status: 'finished', sent: 25 });
    expect((await h.request('POST', path(`/${id}/send`), { cookie: owner })).status).toBe(409);
  });

  it('keep each website separate', async () => {
    const adminB = await h.staff('an-admin-b', [{ roleId: 'administrator', site: 'b' }]);
    expect((await h.request('GET', path(), { cookie: adminB })).status).toBe(404);
  });

  it('can be cancelled', async () => {
    const { id } = await json<{ id: string }>(
      await h.request('POST', path(), { cookie: owner, body: content }),
    );
    expect((await h.request('POST', path(`/${id}/cancel`), { cookie: owner })).status).toBe(200);
    expect((await h.request('POST', path(`/${id}/send`), { cookie: owner })).status).toBe(409);
  });

  it('removing a sign-up removes its delivery records too', async () => {
    const [someone] = await h.db
      .select()
      .from(subscribers)
      .where(eq(subscribers.contactValue, 'person3@example.test'));
    await h.db.delete(subscribers).where(eq(subscribers.id, someone!.id));
    const left = await h.db
      .select()
      .from(announcementDeliveries)
      .where(eq(announcementDeliveries.subscriberId, someone!.id));
    expect(left).toEqual([]);
  });
});

describe('WhatsApp export', () => {
  it('lists only WhatsApp numbers for sending by hand', async () => {
    const response = await h.request('GET', `/api/sites/${SITE}/subscribers/export?type=whatsapp`, {
      cookie: owner,
    });
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain('+963933000000');
    expect(csv).not.toContain('@example.test');
    expect(response.headers.get('Content-Disposition')).toContain('whatsapp-signups');
  });
});
