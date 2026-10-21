import { createPoolDb } from '../client';
import { runMigrations } from '../migrate';
import { requireEnv } from './env';

const { db, close } = createPoolDb(requireEnv('DATABASE_URL'), 1);
try {
  await runMigrations(db);
  console.info('Migrations applied.');
} finally {
  await close();
}
