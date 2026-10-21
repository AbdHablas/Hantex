import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------------------------------
 * Better Auth tables (field names must match Better Auth's model fields; columns are snake_case).
 * Users are dashboard staff only — there are no public customer accounts in Phase 2.
 * ---------------------------------------------------------------------------------------- */

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    /** 'active' or 'disabled'; disabled staff cannot sign in. Managed only by the dashboard API. */
    status: text('status').notNull().default('active'),
    locale: text('locale').notNull().default('ar'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_unique').on(sql`lower(${t.email})`),
    check('users_status_check', sql`${t.status} in ('active', 'disabled')`),
    check('users_locale_check', sql`${t.locale} in ('ar', 'en')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

export const passkeys = pgTable(
  'passkeys',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull().unique(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    aaguid: text('aaguid'),
  },
  (t) => [index('passkeys_user_id_idx').on(t.userId)],
);

export const authRateLimits = pgTable('auth_rate_limits', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

/* ------------------------------------------------------------------------------------------
 * Roles and permissions (D-019). Permissions are defined in code (@hantex/shared); roles are data.
 * ---------------------------------------------------------------------------------------- */

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  descriptionAr: text('description_ar').notNull().default(''),
  descriptionEn: text('description_en').notNull().default(''),
  isStandard: boolean('is_standard').notNull().default(false),
  /** Assigning or changing holders needs staff.manageAdmins. */
  protected: boolean('protected').notNull().default(false),
  /** Permissions cannot be edited (the Owner role). */
  locked: boolean('locked').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

/** Exactly one role per staff member. */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    assignedBy: text('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('user_roles_role_id_idx').on(t.roleId)],
);

/** Staff invitations, including the single-use first-Owner setup invitation (invitedBy null). */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull().default(''),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    /** SHA-256 of the invitation token; the token itself is only ever in the email. */
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedUserId: text('accepted_user_id').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('invitations_email_idx').on(sql`lower(${t.email})`)],
);

/** Single-use recovery codes (stored hashed) for adding a passkey on a new device. */
export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull().unique(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('recovery_codes_user_id_idx').on(t.userId)],
);

/**
 * Append-only audit log. The dashboard's database user may only INSERT and SELECT here
 * (sql/roles.sql), so entries cannot be edited or deleted from the application.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: text('actor_user_id'),
    /** Snapshot of who acted (email), kept even if the account is later removed. */
    actorLabel: text('actor_label').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    details: jsonb('details').notNull().default({}),
    requestId: text('request_id'),
  },
  (t) => [
    index('audit_log_occurred_at_idx').on(t.occurredAt),
    index('audit_log_actor_idx').on(t.actorUserId),
  ],
);

/* ------------------------------------------------------------------------------------------
 * Versioned documents: Coming Soon content, site settings and the theme (D-016, D-022).
 * One editable draft per kind; publishing appends an immutable version. Rollback republishes
 * an older version's data as a new version, so history stays linear and auditable.
 * ---------------------------------------------------------------------------------------- */

export const DOCUMENT_KINDS = ['coming-soon', 'site-settings', 'theme'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
const kindCheck = (column: unknown) => sql`${column} in ('coming-soon', 'site-settings', 'theme')`;

export const documentDrafts = pgTable(
  'document_drafts',
  {
    kind: text('kind').primaryKey(),
    data: jsonb('data').notNull(),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  (t) => [check('document_drafts_kind_check', kindCheck(t.kind))],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    version: integer('version').notNull(),
    data: jsonb('data').notNull(),
    publishedBy: text('published_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set when this version restored an earlier one. */
    restoredFrom: integer('restored_from'),
  },
  (t) => [
    uniqueIndex('document_versions_kind_version_unique').on(t.kind, t.version),
    check('document_versions_kind_check', kindCheck(t.kind)),
  ],
);

/** Static-site rebuilds triggered by publishing (D-006). */
export const publishJobs = pgTable(
  'publish_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestedBy: text('requested_by').references(() => users.id, { onDelete: 'set null' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('queued'),
    detail: text('detail'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'publish_jobs_status_check',
      sql`${t.status} in ('queued', 'dispatched', 'succeeded', 'failed')`,
    ),
  ],
);

/* ------------------------------------------------------------------------------------------
 * Launch-notification sign-ups (D-018). The public site's database user may only INSERT.
 * ---------------------------------------------------------------------------------------- */

export const subscribers = pgTable(
  'subscribers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactType: text('contact_type').notNull(),
    contactValue: text('contact_value').notNull(),
    locale: text('locale').notNull(),
    consentVersion: text('consent_version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('subscribers_contact_unique').on(t.contactType, t.contactValue),
    check('subscribers_contact_type_check', sql`${t.contactType} in ('email', 'whatsapp')`),
    check('subscribers_locale_check', sql`${t.locale} in ('ar', 'en')`),
  ],
);

/** Fixed-window rate limits for public endpoints, shared across Worker instances. */
export const formRateLimits = pgTable('form_rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStartedAt: bigint('window_started_at', { mode: 'number' }).notNull(),
});
