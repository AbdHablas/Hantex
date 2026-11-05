# Security review — November 2026

**Date:** 2026-11-05. **Scope:** the whole repository (dashboard API and app, public site engine,
database grants, CI workflows). **Method:** dependency audit and a manual source review, by the
platform's developer (an AI assistant). **Not** an independent penetration test: Strix could not
run here (no Docker daemon, no AI model key, nothing deployed), see *Not tested* below.

## Results

| # | Finding | Severity (proven impact) | Status |
|---|---------|--------------------------|--------|
| 1 | Rate-limit counters (public forms, dashboard, sign-in) were never deleted. Every new visitor address added a row for ever; a flood from many addresses could fill the free database (0.5 GB). | Medium: availability, unauthenticated, not exploited | **Fixed:** counters older than a day are deleted by the dashboard Worker's five-minute cron; the dashboard's database user may delete public counters but not read their keys. Tested as that user. |
| 2 | Two dependency advisories, both in development tools only: esbuild's dev server (GHSA-67mh-4wv8-2f99, via drizzle-kit) and minimatch (GHSA-g3hv-75wg-m249, via ESLint). Neither reaches the Workers. | Low: development machines only | **Fixed:** pinned overrides to esbuild 0.25.12 and minimatch 11.0.4; `pnpm audit` reports none. drizzle-kit and ESLint checked working. |
| 3 | The publish workflow's callback uses one secret for every website. Whoever holds it could mark any website's build as finished or failed (it can't change content). | Low: needs the secret | **Accepted** for now: the secret lives only in GitHub and the dashboard Worker. Per-site secrets can follow if more people get access to the workflow. |
| 4 | An expired certificate stays downloadable at its address until the next Publish changes (pages already leave it out). | Low: a document the owner published | **Known** (D-050). |

## Checked and found sound

- **Raw HTML:** only three places write raw HTML: the JSON-LD block, escaped and tested so it can't end its element, and two theme stylesheets built from validated values (hex colours; uploaded fonts referenced by their checked id, never their name). No `eval` or `new Function`.
- **Isolation between websites:** every lookup by id in the site routes is also limited to the website in the address; platform-wide records (roles, fonts, presets) need platform permissions. Tested by the access-matrix and isolation tests.
- **Cross-site requests:** session cookies are `HttpOnly` and `SameSite=Strict`, and every state-changing request must come from the dashboard's own origin. The public forms accept only their own site's origin.
- **Public endpoints:** media, file and font addresses accept only strict id patterns (no path traversal); unsubscribe needs a signed link and a POST; previews are signed, expire and are re-validated; sign-ups and enquiries are rate-limited, checked by Turnstile and stored by an insert-only database user.
- **Outbound requests:** only to fixed addresses (Resend, Turnstile, GitHub); nothing fetches an address taken from a request.
- **Redirects:** no sign-in or other redirect takes its destination from the request.
- **Audit log:** never records secrets, tokens or passwords; contact details are masked.

## Not tested

- **Live attacks:** no staging environment exists, so nothing was attacked over the network,
  and no finding above was exploited. Configuration that exists only when deployed (Cloudflare
  Access, DNS, Worker secrets, Hyperdrive, R2 permissions) was not reviewed.
- **AI pentest (Strix):** `.github/workflows/security-scan.yml` runs Strix 1.7.0 on the source in
  GitHub Actions, by hand only. It needs two repository secrets the owner adds (`STRIX_LLM`,
  `LLM_API_KEY`) and spends money on the AI model, up to the budget chosen when it is started
  (US$10 by default). It is not part of the free plan, so it hasn't been run.
- **Categories a source review can't settle:** behaviour under real load, logging and alerting
  in production, and supply-chain integrity beyond the audit and pinned versions.

Next: run the Strix workflow if the owner approves its cost, then pentest the staging deployment
before launch, and repeat the review before each major release.
