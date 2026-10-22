import { createPoolDb } from '@hantex/db/client';
import { ensureSite, FIRST_SITE, roleAssignments, users, type Database } from '@hantex/db/worker';
import { testUtils } from 'better-auth/plugins';
import { randomBytes } from 'node:crypto';
import { inject } from 'vitest';
import { createApp } from '../src/app';
import { createAuth } from '../src/auth/auth';
import type { Env } from '../src/env';
import { memorySender } from '../src/lib/email';
import type { Publisher } from '../src/lib/publisher';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    rolePasswords: Record<string, string>;
  }
}

export const APP_ORIGIN = 'https://admin.example.test';

export const env: Env = {
  HYPERDRIVE: undefined as unknown as Hyperdrive,
  ENVIRONMENT: 'development',
  APP_ORIGIN,
  BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
  TOKEN_HASH_SECRET: randomBytes(32).toString('base64url'),
  PREVIEW_SIGNING_SECRET: randomBytes(32).toString('base64url'),
  UNSUBSCRIBE_SECRET: 'test-unsubscribe-secret',
  EMAIL_FROM: 'Dashboard <dashboard@example.test>',
  TURNSTILE_SITE_KEY: 'test-site-key',
  TURNSTILE_SECRET_KEY: 'test-secret',
  PUBLISH_CALLBACK_SECRET: randomBytes(32).toString('base64url'),
};

export interface Harness {
  /** Server errors the app logged, so a failing test can show the cause. */
  errors: string[];
  /** Owner connection, for fixtures and assertions. */
  db: Database;
  app: ReturnType<typeof createApp>;
  mail: ReturnType<typeof memorySender>;
  dispatched: { jobId: string; siteKey: string }[];
  turnstile: { pass: boolean };
  sites: { a: string; b: string };
  /** Creates a staff member with role assignments and returns their session cookie. */
  staff(id: string, assignments: { roleId: string; site: 'a' | 'b' | null }[]): Promise<string>;
  /** A session cookie for an existing staff member. */
  login(userId: string): Promise<string>;
  request(
    method: string,
    path: string,
    options?: { cookie?: string; body?: unknown; origin?: string | null },
  ): Promise<Response>;
  close(): Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const databaseUrl = inject('databaseUrl');
  const passwords = inject('rolePasswords');

  const owner = createPoolDb(databaseUrl, 2);
  const appUrl = new URL(databaseUrl);
  appUrl.username = 'hantex_admin_app';
  appUrl.password = passwords['hantex_admin_app'] ?? '';
  const appDb = createPoolDb(appUrl.toString(), 4);

  const errors: string[] = [];
  const logError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(JSON.stringify(args));
    logError(...args);
  };

  const mail = memorySender();
  const dispatched: { jobId: string; siteKey: string }[] = [];
  const turnstile = { pass: true };
  const publisher: Publisher = {
    dispatch(job) {
      dispatched.push(job);
      return Promise.resolve({ dispatched: true, detail: 'dispatched' });
    },
  };

  const app = createApp({
    connectDb: () => Promise.resolve({ db: appDb.db, close: () => Promise.resolve() }),
    email: () => mail,
    turnstile: () => ({ verify: () => Promise.resolve(turnstile.pass) }),
    publisher: () => publisher,
    rateLimits: false,
  });

  // A separate auth instance with Better Auth's test plugin, used only to create real, signed
  // sessions; the app itself runs without it.
  const testAuth = createAuth({ db: owner.db, env, plugins: [testUtils()], rateLimit: false });
  // Plugins passed through createAuth aren't visible to Better Auth's types; this is the one
  // helper used.
  const { test: helpers } = (await testAuth.$context) as unknown as {
    test: { login(options: { userId: string }): Promise<{ headers: Headers }> };
  };

  const a = await ensureSite(owner.db, FIRST_SITE);
  const b = await ensureSite(owner.db, {
    key: 'second-brand',
    name: { ar: 'Second', en: 'Second Brand' },
    locales: ['en'],
    defaultLocale: 'en',
    template: 'product-showcase',
    domains: [{ hostname: 'www.second.example', isPrimary: true }],
  });
  const sites = { a, b };

  const login = async (userId: string) => {
    const { headers } = await helpers.login({ userId });
    return headers.get('cookie') ?? '';
  };

  return {
    errors,
    db: owner.db,
    app,
    mail,
    dispatched,
    turnstile,
    sites,
    login,
    async staff(id, assignments) {
      await owner.db
        .insert(users)
        .values({ id, name: id, email: `${id}@example.test`, emailVerified: true });
      if (assignments.length > 0) {
        await owner.db.insert(roleAssignments).values(
          assignments.map((x) => ({
            userId: id,
            roleId: x.roleId,
            siteId: x.site ? sites[x.site] : null,
          })),
        );
      }
      return login(id);
    },
    async request(method, path, options = {}) {
      const headers = new Headers();
      if (options.cookie) headers.set('cookie', options.cookie);
      if (options.origin !== null) headers.set('origin', options.origin ?? APP_ORIGIN);
      let body: string | undefined;
      if (options.body !== undefined) {
        headers.set('content-type', 'application/json');
        body = JSON.stringify(options.body);
      }
      return app.request(`http://localhost${path}`, { method, headers, body }, env);
    },
    async close() {
      console.error = logError;
      await appDb.close();
      await owner.close();
    },
  };
}
