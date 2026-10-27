-- Least-privilege grants for the application's database users (docs/security.md).
-- Run after every migration by `pnpm --filter @hantex/db roles` (idempotent).
-- Every new table must be added here explicitly; nothing is granted by default.

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO hantex_admin_app, hantex_public_app, hantex_build, hantex_backup;

-- Dashboard API (apps/api)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, sessions, accounts, verifications, passkeys, auth_rate_limits,
  roles, role_permissions, role_assignments, invitations, recovery_codes,
  enrolment_tickets, email_challenges, dashboard_rate_limits,
  site_domains, document_drafts, publish_jobs, theme_presets
TO hantex_admin_app;
-- Media library (D-044): the files themselves are in R2.
GRANT SELECT, INSERT, UPDATE, DELETE ON media_assets TO hantex_admin_app;
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

-- Public site endpoints (apps/web): add sign-ups (cannot read them back), rate limits,
-- and read published content. Each site's Worker supplies site_id from its own configuration.
GRANT INSERT (site_id, contact_type, contact_value, locale, consent_version) ON subscribers TO hantex_public_app;
GRANT SELECT, INSERT, UPDATE ON form_rate_limits TO hantex_public_app;
GRANT SELECT ON document_versions TO hantex_public_app;
-- One-click unsubscribe: removes one sign-up of the site, nothing else (migration 0006).
GRANT EXECUTE ON FUNCTION unsubscribe(uuid, uuid) TO hantex_public_app;

-- Static site build: published content and theme, and the site's own configuration.
GRANT SELECT ON document_versions, sites, site_domains TO hantex_build;
-- What pages need to draw published images (D-044); not who uploaded them or their file names.
GRANT SELECT (id, site_id, width, height, variants, alt, published_at) ON media_assets TO hantex_build;
-- Uploaded fonts a theme uses (D-033): their files and scripts, not who confirmed the licence.
GRANT SELECT (id, family, scripts, files) ON fonts TO hantex_build;

-- Nightly backups (D-010): read-only.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hantex_backup;
