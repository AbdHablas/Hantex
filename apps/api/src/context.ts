import type { Database } from '@hantex/db/worker';
import type { Permission } from '@hantex/shared';
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

/** The site a site-scoped request works on (`/api/sites/:siteKey/...`). */
export interface SiteInfo {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  locales: string[];
  defaultLocale: string;
  mode: string;
  template: string;
  archivedAt: Date | null;
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
    /**
     * The permissions that apply to this request: on a site's routes, the person's permissions
     * on that site; on platform routes, those from an all-sites assignment.
     */
    permissions: Set<Permission>;
    /** Set on site-scoped routes only. */
    site: SiteInfo;
  };
}
