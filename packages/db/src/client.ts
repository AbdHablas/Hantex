import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

/** A Drizzle database over node-postgres, whether backed by a pool (Node) or a client (Workers). */
export type Database = NodePgDatabase<typeof schema>;

/** Node.js (scripts, tests, CI): a connection pool. */
export function createPoolDb(connectionString: string, max = 5): { db: Database; close: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString, max });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
