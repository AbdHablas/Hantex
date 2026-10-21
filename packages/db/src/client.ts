import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/** Node.js (scripts, tests, CI): a connection pool. */
export function createPoolDb(connectionString: string, max = 5) {
  const pool = new pg.Pool({ connectionString, max });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
