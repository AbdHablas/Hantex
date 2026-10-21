import { readFile } from 'node:fs/promises';
import pg from 'pg';

export const APP_DB_ROLES = [
  'hantex_admin_app',
  'hantex_public_app',
  'hantex_build',
  'hantex_backup',
] as const;
export type AppDbRole = (typeof APP_DB_ROLES)[number];

const GRANTS_FILE = new URL('../sql/grants.sql', import.meta.url);

/**
 * Creates the application's database users if missing, sets their passwords, and applies
 * sql/grants.sql. Must run as the database owner (on Neon, the project's owner role).
 * Passwords are passed in, never stored in the repository.
 */
export async function applyDatabaseRoles(
  connectionString: string,
  passwords: Record<AppDbRole, string>,
): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const role of APP_DB_ROLES) {
      const password = passwords[role];
      if (!password || password.length < 24)
        throw new Error(`A password of at least 24 characters is required for ${role}`);
      const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      const ident = client.escapeIdentifier(role);
      const literal = client.escapeLiteral(password);
      if (exists.rowCount === 0) {
        await client.query(`CREATE ROLE ${ident} LOGIN NOINHERIT PASSWORD ${literal}`);
      } else {
        await client.query(`ALTER ROLE ${ident} LOGIN NOINHERIT PASSWORD ${literal}`);
      }
    }
    await client.query(await readFile(GRANTS_FILE, 'utf8'));
  } finally {
    await client.end();
  }
}
