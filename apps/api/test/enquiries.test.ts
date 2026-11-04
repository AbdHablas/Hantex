import { FIRST_SITE, auditLog, enquiries, sites } from '@hantex/db/worker';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';

/**
 * Enquiries (D-051) in the dashboard: who may read, export, answer and delete them, and that
 * each website sees only its own. Enquiries arrive from the public site; here they are added
 * directly to the database.
 */

let h: Harness;
let owner: string;
let sales: string;
let editor: string;
let otherSales: string;
const ONE = FIRST_SITE.key;
const TWO = 'second-brand';
const json = async <T>(response: Response) => (await response.json()) as T;
const siteIds: Record<string, string> = {};

interface Row {
  id: string;
  name: string;
  status: string;
  productName: string;
  quantity: number | null;
}

async function add(site: string, name: string, extra: Partial<typeof enquiries.$inferInsert> = {}) {
  const [row] = await h.db
    .insert(enquiries)
    .values({
      siteId: siteIds[site]!,
      kind: 'quote',
      productId: 'prd000001',
      productName: 'One-gang switch',
      name,
      contactType: 'email',
      contactValue: `${name.toLowerCase()}@example.test`,
      quantity: 20,
      message: '=HYPERLINK("http://evil")',
      locale: 'en',
      consentVersion: 'enquiry-consent-v1',
      ...extra,
    })
    .returning({ id: enquiries.id });
  return row!.id;
}

const list = async (site: string, cookie: string, query = '') =>
  h.request('GET', `/api/sites/${site}/enquiries${query}`, { cookie });

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('eq-owner', [{ roleId: 'owner', site: null }]);
  for (const key of [ONE, TWO]) {
    const [site] = await h.db.select({ id: sites.id }).from(sites).where(eq(sites.key, key));
    siteIds[key] = site!.id;
  }
  // The harness's two websites: 'a' is hantex-ultra, 'b' second-brand.
  sales = await h.staff('eq-sales', [{ roleId: 'sales', site: 'a' }]);
  editor = await h.staff('eq-editor', [{ roleId: 'editor', site: 'a' }]);
  otherSales = await h.staff('eq-sales-two', [{ roleId: 'sales', site: 'b' }]);
});
afterAll(() => h.close());

describe('enquiries in the dashboard (D-051)', () => {
  it('lists a website’s enquiries for Sales, newest first, and nobody else’s', async () => {
    await add(ONE, 'Alice');
    await add(ONE, 'Bob', { status: 'replied' });
    await add(TWO, 'Carol');
    const mine = await json<{ enquiries: Row[] }>(await list(ONE, sales));
    expect(mine.enquiries.map((e) => e.name)).toEqual(['Bob', 'Alice']);
    expect(mine.enquiries[1]).toMatchObject({ productName: 'One-gang switch', quantity: 20 });
    const open = await json<{ enquiries: Row[] }>(await list(ONE, sales, '?status=new'));
    expect(open.enquiries.map((e) => e.name)).toEqual(['Alice']);
    const found = await json<{ enquiries: Row[] }>(await list(ONE, owner, '?q=bob'));
    expect(found.enquiries.map((e) => e.name)).toEqual(['Bob']);
    // Editors don't see customers' details; Sales of another website can't open this one.
    expect((await list(ONE, editor)).status).toBe(403);
    expect((await list(ONE, otherSales)).status).toBe(404);
  });

  it('lets Sales mark an enquiry replied or closed, but only on its own website', async () => {
    const id = await add(ONE, 'Dana');
    const patch = (site: string, cookie: string, status: string) =>
      h.request('PATCH', `/api/sites/${site}/enquiries/${id}`, { cookie, body: { status } });
    expect((await patch(ONE, sales, 'replied')).status).toBe(200);
    expect((await patch(ONE, sales, 'lost')).status).toBe(400);
    expect((await patch(ONE, editor, 'closed')).status).toBe(403);
    // Through another website's address the enquiry doesn't exist.
    expect((await patch(TWO, owner, 'closed')).status).toBe(404);
    const [row] = await h.db.select().from(enquiries).where(eq(enquiries.id, id));
    expect(row?.status).toBe('replied');
    const [audit] = await h.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'enquiries.status-changed'), eq(auditLog.targetId, id)));
    expect(JSON.stringify(audit?.details)).not.toContain('dana@example.test');
  });

  it('exports CSV that spreadsheets will not run as formulas', async () => {
    const response = await h.request('GET', `/api/sites/${ONE}/enquiries/export`, {
      cookie: sales,
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(text).not.toContain('carol@example.test');
  });

  it('lets only Owners and Administrators delete enquiries', async () => {
    const id = await add(ONE, 'Erin');
    const remove = (cookie: string) =>
      h.request('DELETE', `/api/sites/${ONE}/enquiries/${id}`, { cookie });
    expect((await remove(sales)).status).toBe(403);
    expect((await remove(owner)).status).toBe(200);
    expect((await remove(owner)).status).toBe(404);
  });

  it('shows the number of new enquiries on the overview, without who sent them', async () => {
    const overview = await json<{ enquiries: { new: number } }>(
      await h.request('GET', `/api/sites/${ONE}/overview`, { cookie: editor }),
    );
    expect(overview.enquiries.new).toBeGreaterThanOrEqual(1);
  });
});
