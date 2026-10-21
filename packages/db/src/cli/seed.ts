import { createPoolDb } from '../client';
import { FIRST_SITE, ensureSite, syncStandardRoles } from '../seed';
import { requireEnv } from './env';

const { db, close } = createPoolDb(requireEnv('DATABASE_URL'), 1);
try {
  await syncStandardRoles(db);
  console.info('Standard roles are in place.');
  await ensureSite(db, FIRST_SITE);
  console.info(`Site "${FIRST_SITE.key}" is in place.`);
} finally {
  await close();
}
