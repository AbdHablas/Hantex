import { createPoolDb } from '@hantex/db/client';
import { FIRST_SITE, ensureSite, subscribers } from '@hantex/db/worker';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { signupStore } from './store';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    rolePasswords: Record<string, string>;
  }
}

let owner: ReturnType<typeof createPoolDb>;
let publicClient: pg.Client;
let siteId: string;

beforeAll(async () => {
  const url = inject('databaseUrl');
  owner = createPoolDb(url, 1);
  siteId = await ensureSite(owner.db, FIRST_SITE);
  // Connect exactly as the site Worker does: the insert-only public database user.
  const publicUrl = new URL(url);
  publicUrl.username = 'hantex_public_app';
  publicUrl.password = inject('rolePasswords')['hantex_public_app'] ?? '';
  publicClient = new pg.Client({ connectionString: publicUrl.toString() });
  await publicClient.connect();
});
afterAll(async () => {
  await publicClient.end();
  await owner.close();
});

describe('sign-up store, as the public database user', () => {
  it('adds a sign-up once, ignoring repeats', async () => {
    const store = signupStore(publicClient, siteId);
    const row = {
      type: 'email',
      value: 'store-test@example.test',
      locale: 'ar',
      consentVersion: 'v1',
    };
    await store.insert(row);
    await store.insert(row);
    const rows = await owner.db
      .select()
      .from(subscribers)
      .where(eq(subscribers.contactValue, row.value));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.siteId).toBe(siteId);
  });

  it('counts attempts in a fixed window and starts again after it', async () => {
    const store = signupStore(publicClient, siteId);
    const now = 1_000_000;
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await store.allow('signup:test', 5, 60_000, now));
    expect(results).toEqual([true, true, true, true, true, false]);
    expect(await store.allow('signup:test', 5, 60_000, now + 60_001)).toBe(true);
  });

  it('can never read sign-ups back', async () => {
    await expect(publicClient.query('select * from subscribers')).rejects.toThrow(
      /permission denied/,
    );
  });
});
