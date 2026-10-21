/// <reference types="astro/client" />

/** The site Worker's bindings (wrangler.jsonc) and secrets, read through `cloudflare:workers`. */
declare namespace Cloudflare {
  interface Env {
    /** Insert-only public database user (hantex_public_app), through Hyperdrive. */
    HYPERDRIVE: Hyperdrive;
    TURNSTILE_SECRET_KEY: string;
    PREVIEW_SIGNING_SECRET: string;
  }
}
