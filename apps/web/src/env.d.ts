/// <reference types="astro/client" />

/** The site Worker's bindings (wrangler.jsonc) and secrets, read through `cloudflare:workers`. */
declare namespace Cloudflare {
  interface Env {
    /** Insert-only public database user (hantex_public_app), through Hyperdrive. */
    HYPERDRIVE: Hyperdrive;
    /** The public media bucket (D-044): published images, and preview copies behind signed links. */
    MEDIA: R2Bucket;
    TURNSTILE_SECRET_KEY: string;
    PREVIEW_SIGNING_SECRET: string;
    /** Checks the signed unsubscribe links in announcement emails (D-040). */
    UNSUBSCRIBE_SECRET: string;
    /** The dashboard's origin, the only page allowed to frame draft previews. Not a secret. */
    DASHBOARD_ORIGIN?: string;
  }
}
