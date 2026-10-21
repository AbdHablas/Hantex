import type { Database } from '@hantex/db';
import type { BetterAuthPlugin } from 'better-auth';
import type { Auth } from './auth/auth';
import type { Env } from './env';
import type { Access } from './lib/access';
import type { EmailSender } from './lib/email';
import type { Publisher } from './lib/publisher';
import type { TurnstileVerifier } from './lib/turnstile';

/** External services, injected so tests can replace them. */
export interface AppDeps {
  connectDb(env: Env): Promise<{ db: Database; close: () => Promise<void> }>;
  email(env: Env): EmailSender;
  turnstile(env: Env): TurnstileVerifier;
  publisher(env: Env): Publisher;
  authPlugins?: BetterAuthPlugin[];
  rateLimits?: boolean;
}

export interface SessionInfo {
  id: string;
  createdAt: Date;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    requestId: string;
    deps: AppDeps;
    db: Database;
    auth: Auth;
    access: Access;
    session: SessionInfo;
  };
}
