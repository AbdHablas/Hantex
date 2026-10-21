-- Least-privilege grants for the application's database users (docs/security.md).
-- Run after every migration by `pnpm --filter @hantex/db roles` (idempotent).
-- Every new table must be added here explicitly; nothing is granted by default.

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO hantex_admin_app, hantex_public_app, hantex_build, hantex_backup;

-- Dashboard API (apps/api)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, sessions, accounts, verifications, passkeys, auth_rate_limits,
  roles, role_permissions, user_roles, invitations, recovery_codes,
  enrolment_tickets, email_challenges, document_drafts, publish_jobs
TO hantex_admin_app;
-- Rate limits for the dashboard's public steps (invitation and recovery).
GRANT SELECT, INSERT, UPDATE ON form_rate_limits TO hantex_admin_app;
-- Published versions are immutable; the audit log is append-only.
GRANT SELECT, INSERT ON document_versions, audit_log TO hantex_admin_app;
-- Sign-ups: view, export and delete only — sign-ups arrive through the public site.
GRANT SELECT, DELETE ON subscribers TO hantex_admin_app;

-- Public site endpoints (apps/web): add sign-ups (cannot read them back), rate limits,
-- and read published content.
GRANT INSERT (contact_type, contact_value, locale, consent_version) ON subscribers TO hantex_public_app;
GRANT SELECT, INSERT, UPDATE ON form_rate_limits TO hantex_public_app;
GRANT SELECT ON document_versions TO hantex_public_app;

-- Static site build: published content and theme only.
GRANT SELECT ON document_versions TO hantex_build;

-- Nightly backups (D-010): read-only.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hantex_backup;
