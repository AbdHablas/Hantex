/** Worker bindings and configuration (wrangler.jsonc vars and secrets). */
export interface Env {
  /** Dashboard database connection (user hantex_admin_app), Hyperdrive with caching disabled. */
  HYPERDRIVE: Hyperdrive;
  ENVIRONMENT: 'development' | 'preview' | 'production';
  /** https://admin.hantexultra.com — the only origin allowed to call the API. */
  APP_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  /** Keys hashes of low-entropy codes (email codes, recovery codes). */
  TOKEN_HASH_SECRET: string;
  /** Shared with the site Workers to sign draft previews (rendered on each site's primary domain). */
  PREVIEW_SIGNING_SECRET: string;
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  /** GitHub fine-grained token that can only start the publish workflow. */
  PUBLISH_TRIGGER_TOKEN?: string;
  PUBLISH_REPOSITORY?: string;
  PUBLISH_WORKFLOW?: string;
  PUBLISH_REF?: string;
  /** Bearer secret the publish workflow uses to report its result. */
  PUBLISH_CALLBACK_SECRET?: string;
}
