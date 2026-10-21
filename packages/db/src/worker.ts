import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

/**
 * Cloudflare Workers: one client per request, connected through Hyperdrive
 * (docs: hyperdrive/examples/connect-to-postgres/node-postgres). Close it with ctx.waitUntil(close()).
 */
export async function connectWorkerDb(connectionString: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type WorkerDatabase = Awaited<ReturnType<typeof connectWorkerDb>>['db'];
