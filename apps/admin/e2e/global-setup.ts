import {
  APP_DB_ROLES,
  FIRST_SITE,
  applyDatabaseRoles,
  createOwnerSetupInvitation,
  createPoolDb,
  ensureSite,
  runMigrations,
  syncStandardRoles,
} from '@hantex/db';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

/** A fresh database with the first site and a first-Owner setup link for the tests. */
export default async function globalSetup() {
  const env = process.env;
  const base = env['HANTEX_TEST_DATABASE_URL'] ?? 'postgres://postgres@127.0.0.1:54329/postgres';
  const name = env['E2E_DATABASE'] ?? 'hantex_e2e';
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(name)} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(name)}`);

  const url = new URL(base);
  url.pathname = `/${name}`;
  const { db, close } = createPoolDb(url.toString(), 1);
  await runMigrations(db);
  await syncStandardRoles(db);
  await ensureSite(db, FIRST_SITE);
  const passwords = Object.fromEntries(
    APP_DB_ROLES.map((role) => [
      role,
      role === 'hantex_admin_app'
        ? (env['E2E_DB_PASSWORD'] ?? '')
        : randomBytes(16).toString('hex'),
    ]),
  ) as Record<(typeof APP_DB_ROLES)[number], string>;
  await applyDatabaseRoles(url.toString(), passwords);
  // The site build's read-only user, so the tests can build the public site from what they publish.
  const build = new URL(url);
  build.username = 'hantex_build';
  build.password = passwords.hantex_build;
  env['E2E_BUILD_DATABASE_URL'] = build.toString();
  const { link } = await createOwnerSetupInvitation(db, {
    email: 'owner@example.test',
    appOrigin: env['E2E_ORIGIN'] ?? 'http://localhost:8788',
  });
  env['E2E_SETUP_LINK'] = link;
  await close();

  return async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(name)} WITH (FORCE)`);
    await admin.end();
  };
}
