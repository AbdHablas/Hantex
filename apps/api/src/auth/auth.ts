import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { passkey } from '@better-auth/passkey';
import {
  accounts,
  authRateLimits,
  passkeys,
  sessions,
  users,
  verifications,
  type Database,
} from '@hantex/db/worker';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { eq } from 'drizzle-orm';
import type { Env } from '../env';
import { enrolmentHooks } from './enrolment';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
/** Sensitive actions (new passkey, recovery codes) need a sign-in from the last 15 minutes. */
export const FRESH_SESSION_SECONDS = 60 * 15;

export interface AuthOptions {
  db: Database;
  env: Pick<Env, 'APP_ORIGIN' | 'BETTER_AUTH_SECRET' | 'ENVIRONMENT'>;
  plugins?: BetterAuthPlugin[];
  rateLimit?: boolean;
}

/**
 * Better Auth for dashboard staff (D-007): passwordless — passkeys only, invite-only, no public
 * sign-up. Created per request because the database client is per request on Workers.
 */
export function createAuth({ db, env, plugins = [], rateLimit = true }: AuthOptions) {
  const hooks = enrolmentHooks(db);
  const origin = env.APP_ORIGIN;

  return betterAuth({
    appName: 'Hantex Ultra',
    baseURL: origin,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: 'pg',
      transaction: true,
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        passkey: passkeys,
        rateLimit: authRateLimits,
      },
    }),
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        status: { type: 'string', required: false, defaultValue: 'active', input: false },
        locale: { type: 'string', required: false, defaultValue: 'ar', input: false },
      },
    },
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      updateAge: 60 * 60,
      freshAge: FRESH_SESSION_SECONDS,
    },
    rateLimit: {
      enabled: rateLimit,
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 60,
      customRules: {
        '/passkey/generate-authenticate-options': { window: 60, max: 20 },
        '/passkey/verify-authentication': { window: 60, max: 10 },
        '/passkey/generate-register-options': { window: 60, max: 10 },
        '/passkey/verify-registration': { window: 60, max: 10 },
      },
    },
    advanced: {
      cookiePrefix: 'hx',
      useSecureCookies: env.ENVIRONMENT !== 'development',
      defaultCookieAttributes: { sameSite: 'strict', httpOnly: true },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    databaseHooks: {
      session: {
        create: {
          // Disabled staff can never get a session, whatever the sign-in path.
          before: async (session) => {
            const [user] = await db
              .select({ status: users.status })
              .from(users)
              .where(eq(users.id, session.userId));
            return user?.status === 'active' ? { data: session } : false;
          },
        },
      },
    },
    plugins: [
      passkey({
        rpID: new URL(origin).hostname,
        rpName: 'Hantex Ultra',
        origin,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        registration: {
          requireSession: false,
          resolveUser: ({ context }) => hooks.resolveUser({ context }),
          afterVerification: ({ context, user, verification }) =>
            hooks.afterRegistration({
              context,
              user,
              userVerified: verification.registrationInfo?.userVerified,
            }),
        },
        authentication: {
          afterVerification: ({ verification, clientData }) =>
            hooks.afterAuthentication({
              credentialId: clientData.id,
              userVerified: verification.authenticationInfo.userVerified,
            }),
        },
      }),
      ...plugins,
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
