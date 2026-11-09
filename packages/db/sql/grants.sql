-- Least-privilege grants for the application's database users (docs/security.md).
-- Run after every migration by `pnpm --filter @hantex/db roles` (idempotent).
-- Every new table must be added here explicitly; nothing is granted by default.

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public
  TO hantex_admin_app, hantex_public_app, hantex_build, hantex_backup, hantex_studio_runner;

-- Dashboard API (apps/api)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, sessions, accounts, verifications, passkeys, auth_rate_limits,
  roles, role_permissions, role_assignments, invitations, recovery_codes,
  enrolment_tickets, email_challenges, dashboard_rate_limits,
  site_domains, document_drafts, publish_jobs, theme_presets
TO hantex_admin_app;
-- Media library (D-044): the files themselves are in R2.
GRANT SELECT, INSERT, UPDATE, DELETE ON media_assets TO hantex_admin_app;
-- Website files (D-045): PDFs the catalogue attaches; the files themselves are in R2.
GRANT SELECT, INSERT, UPDATE, DELETE ON site_files TO hantex_admin_app;
-- Uploaded fonts (D-033): the files themselves are in R2.
GRANT SELECT, INSERT, UPDATE, DELETE ON fonts TO hantex_admin_app;
-- Announcements (D-040): written and sent from the dashboard; deliveries are a send log.
GRANT SELECT, INSERT, UPDATE ON announcements TO hantex_admin_app;
GRANT SELECT, INSERT ON announcement_deliveries TO hantex_admin_app;
-- Sites are archived, never deleted (D-024).
GRANT SELECT, INSERT, UPDATE ON sites TO hantex_admin_app;
-- Published versions are immutable; the audit log is append-only.
GRANT SELECT, INSERT ON document_versions, audit_log TO hantex_admin_app;
-- Sign-ups: view, export and delete only — sign-ups arrive through the public site.
GRANT SELECT, DELETE ON subscribers TO hantex_admin_app;
-- Clearing public forms' rate-limit counters older than a day (cron); nothing else.
GRANT SELECT (window_started_at), DELETE ON form_rate_limits TO hantex_admin_app;
-- Scheduled publishing (D-054): kept as a history; never deleted.
GRANT SELECT, INSERT, UPDATE ON scheduled_publishes TO hantex_admin_app;
-- Enquiries (D-051): read, delete, and only their status can change.
GRANT SELECT, DELETE ON enquiries TO hantex_admin_app;
GRANT UPDATE (status, updated_at) ON enquiries TO hantex_admin_app;
-- 3D Product Studio (D-029, D-030, D-056): the dashboard creates captures, files, jobs and
-- provider settings, and records review decisions; only the processing runner (below) may set a
-- job's status, cost or timings, or write a model's result, so the dashboard can never forge
-- what a job actually produced. Cancelling an unstarted job is a delete, enforced at the API.
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_captures, studio_capture_files TO hantex_admin_app;
GRANT SELECT, INSERT, DELETE ON studio_jobs TO hantex_admin_app;
GRANT SELECT, INSERT ON studio_reviews TO hantex_admin_app;
GRANT SELECT, INSERT, UPDATE ON studio_provider_settings TO hantex_admin_app;
GRANT SELECT ON studio_spend TO hantex_admin_app;
GRANT SELECT ON studio_models TO hantex_admin_app;
GRANT UPDATE (review_status, approved_by, approved_at, published_at, updated_at) ON studio_models TO hantex_admin_app;

-- Public site endpoints (apps/web): add sign-ups (cannot read them back), rate limits,
-- and read published content. Each site's Worker supplies site_id from its own configuration.
GRANT INSERT (site_id, contact_type, contact_value, locale, consent_version) ON subscribers TO hantex_public_app;
GRANT SELECT, INSERT, UPDATE ON form_rate_limits TO hantex_public_app;
-- Enquiries (D-051): add only, never read back; the status starts as 'new'.
GRANT INSERT (site_id, kind, product_id, product_name, name, contact_type, contact_value, company,
  quantity, message, locale, consent_version) ON enquiries TO hantex_public_app;
GRANT SELECT ON document_versions TO hantex_public_app;
-- One-click unsubscribe: removes one sign-up of the site, nothing else (migration 0006).
GRANT EXECUTE ON FUNCTION unsubscribe(uuid, uuid) TO hantex_public_app;

-- Static site build: published content and theme, and the site's own configuration.
GRANT SELECT ON document_versions, sites, site_domains TO hantex_build;
-- What pages need to draw published images (D-044); not who uploaded them or their file names.
GRANT SELECT (id, site_id, width, height, variants, alt, published_at) ON media_assets TO hantex_build;
-- Published files' sizes for download links; not their uploaded names or uploaders.
GRANT SELECT (id, site_id, bytes, published_at) ON site_files TO hantex_build;
-- Uploaded fonts a theme uses (D-033): their files and scripts, not who confirmed the licence.
GRANT SELECT (id, family, scripts, files) ON fonts TO hantex_build;

-- Nightly backups (D-010): read-only.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hantex_backup;

-- 3D Studio processing runner (D-029, D-030): a separate process on the Owner's own hardware
-- (self-hosted, never Cloudflare), reached by a direct Postgres connection like the site build
-- (apps/web/scripts/site-data.ts). It reads only what it needs to process a capture, writes only
-- a job's own progress and its model's result, and touches nothing else in the database — never
-- users, sessions, roles, catalogue content, media, files or any other site's content.
GRANT SELECT (id, key) ON sites TO hantex_studio_runner;
GRANT SELECT ON studio_captures, studio_capture_files TO hantex_studio_runner;
GRANT SELECT ON studio_jobs TO hantex_studio_runner;
GRANT UPDATE (status, detail, actual_cost_cents, started_at, finished_at) ON studio_jobs TO hantex_studio_runner;
GRANT SELECT, INSERT ON studio_models TO hantex_studio_runner;
GRANT INSERT ON studio_spend TO hantex_studio_runner;
