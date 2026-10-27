import { createPoolDb } from '../client';
import { runMigrations } from '../migrate';
import { ownerDatabaseUrl } from './env';

const { db, close } = createPoolDb(ownerDatabaseUrl(), 1);
try {
  await runMigrations(db);
  console.info('Migrations applied.');
} finally {
  await close();
}
