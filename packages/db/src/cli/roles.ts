import { APP_DB_ROLES, applyDatabaseRoles, type AppDbRole } from '../roles';
import { requireEnv } from './env';

// Passwords come from the environment, e.g. HANTEX_ADMIN_APP_PASSWORD for hantex_admin_app.
const passwords = Object.fromEntries(
  APP_DB_ROLES.map((role) => [role, requireEnv(`${role.toUpperCase()}_PASSWORD`)]),
) as Record<AppDbRole, string>;

await applyDatabaseRoles(requireEnv('DATABASE_URL'), passwords);
console.info('Database users and grants applied.');
