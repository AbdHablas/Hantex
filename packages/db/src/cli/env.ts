import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

/**
 * The database owner's connection for migrations, roles and setup (D-047). A connection string
 * set in the environment (CI, deploy.yml, your shell) always wins. Otherwise the repository's
 * `.env.local`, written by `neon deploy` (git-ignored), is used, and the script says which Neon
 * branch it is about to change. Admin tasks prefer Neon's direct connection
 * (DATABASE_URL_UNPOOLED): schema changes and role grants shouldn't go through the pooler.
 */
export function ownerDatabaseUrl(): string {
  const set = process.env['DATABASE_URL_UNPOOLED'] || process.env['DATABASE_URL'];
  if (set) return set;
  const file = new URL('../../../../.env.local', import.meta.url);
  const local = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  const url = local['DATABASE_URL_UNPOOLED'] || local['DATABASE_URL'];
  if (!url) return requireEnv('DATABASE_URL');
  console.info(
    `Using .env.local: Neon branch "${local['NEON_BRANCH'] ?? 'unknown'}" at ${new URL(url).hostname}.`,
  );
  return url;
}
