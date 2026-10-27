import { createPoolDb } from '../client';
import { createOwnerSetupInvitation, SETUP_INVITATION_HOURS } from '../setup-owner';
import { ownerDatabaseUrl, requireEnv } from './env';

// Usage: DATABASE_URL=… APP_ORIGIN=https://admin.hantexultra.com pnpm --filter @hantex/db setup-owner owner@example.com
// Prints the setup link once. Send it to the Owner privately; it is not stored anywhere.
const email = process.argv[2];
if (!email) {
  console.error('Usage: pnpm --filter @hantex/db setup-owner <owner email>');
  process.exit(1);
}

const { db, close } = createPoolDb(ownerDatabaseUrl(), 1);
try {
  const { link, expiresAt } = await createOwnerSetupInvitation(db, {
    email,
    appOrigin: requireEnv('APP_ORIGIN'),
  });
  console.info(
    `First-Owner setup link (single use, valid ${SETUP_INVITATION_HOURS} hours, until ${expiresAt.toISOString()}):`,
  );
  console.info(link);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await close();
}
