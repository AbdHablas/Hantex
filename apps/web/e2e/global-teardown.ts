import pg from 'pg';

/** Drops the test database created by e2e/serve.ts. */
export default async function globalTeardown() {
  const admin = new pg.Client({
    connectionString:
      process.env['HANTEX_TEST_DATABASE_URL'] ?? 'postgres://postgres@127.0.0.1:54329/postgres',
  });
  await admin.connect();
  await admin.query(
    `DROP DATABASE IF EXISTS ${admin.escapeIdentifier(process.env['E2E_DATABASE'] ?? 'hantex_web_e2e')} WITH (FORCE)`,
  );
  await admin.end();
}
