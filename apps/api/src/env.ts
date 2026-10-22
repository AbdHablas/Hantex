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
  /** Shared with the site Workers to sign the unsubscribe links in announcement emails (D-040). */
  UNSUBSCRIBE_SECRET: string;
  /**
   * Most announcement emails sent per 24 hours across all sites, to stay within the email
   * provider's plan; set it to your Resend plan's daily limit. Default 100.
   */
  ANNOUNCEMENT_DAILY_LIMIT?: string;
  /** The media library's R2 bucket (D-044). */
  MEDIA?: R2Bucket;
  /** Most media each site may store, in megabytes (default 1024; R2's free plan has 10 GB). */
  MEDIA_SITE_QUOTA_MB?: string;
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
