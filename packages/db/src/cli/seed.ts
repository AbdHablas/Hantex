import { createPoolDb } from '../client';
import { syncStandardRoles } from '../seed';
import { requireEnv } from './env';

const { db, close } = createPoolDb(requireEnv('DATABASE_URL'), 1);
try {
  await syncStandardRoles(db);
  console.info('Standard roles are in place.');
} finally {
  await close();
}
