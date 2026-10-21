import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { createPoolDb } from '../src/client';
import { runMigrations } from '../src/migrate';
import { APP_DB_ROLES, applyDatabaseRoles, type AppDbRole } from '../src/roles';
import { FIRST_SITE, ensureSite, syncStandardRoles } from '../src/seed';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    rolePasswords: Record<AppDbRole, string>;
  }
}

/** Creates a throwaway database, migrates it and applies the database users and grants. */
export default async function setup(project: TestProject) {
  const baseUrl =
    process.env['HANTEX_TEST_DATABASE_URL'] ?? 'postgres://postgres@127.0.0.1:54329/postgres';
  const name = `hantex_test_${process.pid}_${Date.now()}`;

  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(name)}`);

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const databaseUrl = url.toString();

  const { db, close } = createPoolDb(databaseUrl, 1);
  await runMigrations(db);
  await syncStandardRoles(db);
  await ensureSite(db, FIRST_SITE);
  await close();

  // Database users exist once per PostgreSQL server, not per database, and test projects set up
  // in parallel. They share one set of passwords for the run, so one project's setup never
  // changes the passwords another project is using.
  const shared = process.env['HANTEX_TEST_ROLE_PASSWORDS'];
  const rolePasswords = (
    shared
      ? JSON.parse(shared)
      : Object.fromEntries(
          APP_DB_ROLES.map((role) => [role, randomBytes(24).toString('base64url')]),
        )
  ) as Record<AppDbRole, string>;
  process.env['HANTEX_TEST_ROLE_PASSWORDS'] = JSON.stringify(rolePasswords);
  await applyDatabaseRoles(databaseUrl, rolePasswords);

  project.provide('databaseUrl', databaseUrl);
  project.provide('rolePasswords', rolePasswords);

  return async () => {
    await admin.query(`DROP DATABASE ${admin.escapeIdentifier(name)} WITH (FORCE)`);
    await admin.end();
  };
}
