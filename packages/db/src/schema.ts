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
  unique,
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
 * Sites (D-024): every public website the dashboard manages. Sites are archived, never deleted,
 * so their records and audit history stay intact (foreign keys to sites use ON DELETE RESTRICT).
 * ---------------------------------------------------------------------------------------- */

export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Short key, e.g. 'hantex-ultra': names the Worker `site-<key>` and appears in API paths. */
    key: text('key').notNull().unique(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    locales: text('locales').array().notNull(),
    defaultLocale: text('default_locale').notNull(),
    /** New sites always start in Coming Soon mode; only an Owner switches them live. */
    mode: text('mode').notNull().default('coming-soon'),
    template: text('template').notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    check('sites_key_check', sql`${t.key} ~ '^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,39}$'`),
    check('sites_mode_check', sql`${t.mode} in ('coming-soon', 'live', 'maintenance')`),
    check('sites_template_check', sql`${t.template} in ('coming-soon', 'product-showcase')`),
    check(
      'sites_locales_check',
      sql`cardinality(${t.locales}) >= 1 and ${t.locales} <@ array['ar', 'en']::text[]`,
    ),
    check('sites_default_locale_check', sql`${t.defaultLocale} = any(${t.locales})`),
  ],
);

/**
 * A site's domains. Added as 'pending' from the dashboard; they become 'active' only through a
 * production deployment the Owner approves (docs/deployment.md). The dashboard never touches DNS.
 */
export const siteDomains = pgTable(
  'site_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'restrict' }),
    hostname: text('hostname').notNull(),
    /** The canonical address; other domains redirect to it. */
    isPrimary: boolean('is_primary').notNull().default(false),
    status: text('status').notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // A hostname belongs to one site at a time; removed entries keep their history.
    uniqueIndex('site_domains_hostname_unique')
      .on(t.hostname)
      .where(sql`${t.status} <> 'removed'`),
    uniqueIndex('site_domains_primary_unique')
      .on(t.siteId)
      .where(sql`${t.isPrimary} and ${t.status} <> 'removed'`),
    index('site_domains_site_id_idx').on(t.siteId),
    check(
      'site_domains_hostname_check',
      sql`${t.hostname} ~ '^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$'`,
    ),
    check('site_domains_status_check', sql`${t.status} in ('pending', 'active', 'removed')`),
  ],
);

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

/**
 * Who holds which role where (D-025). site_id null = all sites. A person has either one
 * all-sites assignment or per-site assignments (one per site), never both, and roles that are
 * locked (Owner) are always all-sites. The unique index and the trigger in migration 0001 enforce
 * this in the database as well as in the API (checkAssignmentScope in @hantex/shared).
 */
export const roleAssignments = pgTable(
  'role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'restrict' }),
    assignedBy: text('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('role_assignments_user_site_unique').on(t.userId, t.siteId).nullsNotDistinct(),
    index('role_assignments_role_id_idx').on(t.roleId),
    index('role_assignments_site_id_idx').on(t.siteId),
  ],
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
    /** The site the role applies to once accepted; null = all sites (D-025). */
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'restrict' }),
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
 * Short-lived, single-use tickets that allow registering a passkey without a session:
 * accepting an invitation, or recovering access. The ticket (not the invitation token) is what
 * travels in the WebAuthn options request, and only its SHA-256 hash is stored.
 */
export const enrolmentTickets = pgTable(
  'enrolment_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purpose: text('purpose').notNull(),
    ticketHash: text('ticket_hash').notNull().unique(),
    /** For invitations: the id the new staff account will get once the passkey is verified. */
    userId: text('user_id').notNull(),
    invitationId: uuid('invitation_id').references(() => invitations.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('enrolment_tickets_purpose_check', sql`${t.purpose} in ('invitation', 'recovery')`),
  ],
);

/** Emailed one-time codes for account recovery (stored as keyed hashes, limited attempts). */
export const emailChallenges = pgTable(
  'email_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('email_challenges_user_id_idx').on(t.userId)],
);

/** Fixed-window rate limits for the dashboard's steps before sign-in (invitations, recovery). */
export const dashboardRateLimits = pgTable('dashboard_rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStartedAt: bigint('window_started_at', { mode: 'number' }).notNull(),
});

/**
 * Append-only audit log. The dashboard's database user may only INSERT and SELECT here
 * (sql/roles.sql), so entries cannot be edited or deleted from the application.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** The site the action concerned; null for platform-wide actions. */
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'restrict' }),
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
    index('audit_log_site_idx').on(t.siteId, t.occurredAt),
    index('audit_log_actor_idx').on(t.actorUserId),
  ],
);

/* ------------------------------------------------------------------------------------------
 * Versioned documents: Coming Soon content, site settings and the theme (D-016, D-022).
 * Each site has one editable draft per kind (D-024); publishing appends an immutable version. Rollback republishes
 * an older version's data as a new version, so history stays linear and auditable.
 * ---------------------------------------------------------------------------------------- */

/**
 * Site documents. Most kinds have one document per site (key ''); pages have one per page, keyed
 * by the page's id (D-035).
 */
export const DOCUMENT_KINDS = [
  'coming-soon',
  'site-settings',
  'theme',
  'page',
  'pages',
  'menus',
  'layout',
  'saved-sections',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
const kindCheck = (column: unknown) =>
  sql`${column} in ('coming-soon', 'site-settings', 'theme', 'page', 'pages', 'menus', 'layout', 'saved-sections')`;
const keyColumn = () => text('key').notNull().default('');

const siteRef = () =>
  uuid('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'restrict' });

export const documentDrafts = pgTable(
  'document_drafts',
  {
    siteId: siteRef(),
    kind: text('kind').notNull(),
    key: keyColumn(),
    data: jsonb('data').notNull(),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.kind, t.key] }),
    check('document_drafts_kind_check', kindCheck(t.kind)),
  ],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: siteRef(),
    kind: text('kind').notNull(),
    key: keyColumn(),
    version: integer('version').notNull(),
    data: jsonb('data').notNull(),
    publishedBy: text('published_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set when this version restored an earlier one. */
    restoredFrom: integer('restored_from'),
  },
  (t) => [
    uniqueIndex('document_versions_site_kind_key_version_unique').on(
      t.siteId,
      t.kind,
      t.key,
      t.version,
    ),
    check('document_versions_kind_check', kindCheck(t.kind)),
  ],
);

/**
 * Saved theme presets, shared by all sites (D-027). The built-in presets (brand, neutral) live in
 * code (@hantex/theme); these are the ones staff save from a site's theme.
 */
export const themePresets = pgTable('theme_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  data: jsonb('data').notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

/** Static-site rebuilds triggered by publishing (D-006); each rebuilds one site (D-028). */
export const publishJobs = pgTable(
  'publish_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: siteRef(),
    requestedBy: text('requested_by').references(() => users.id, { onDelete: 'set null' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('queued'),
    detail: text('detail'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('publish_jobs_site_idx').on(t.siteId, t.requestedAt),
    check(
      'publish_jobs_status_check',
      sql`${t.status} in ('queued', 'dispatched', 'succeeded', 'failed')`,
    ),
  ],
);

/* ------------------------------------------------------------------------------------------
 * Launch-notification sign-ups (D-018), per site. The public site's database user may only
 * INSERT; each site's Worker sets site_id from its own configuration, never from the request.
 * ---------------------------------------------------------------------------------------- */

export const subscribers = pgTable(
  'subscribers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: siteRef(),
    contactType: text('contact_type').notNull(),
    contactValue: text('contact_value').notNull(),
    locale: text('locale').notNull(),
    consentVersion: text('consent_version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('subscribers_site_contact_unique').on(t.siteId, t.contactType, t.contactValue),
    check('subscribers_contact_type_check', sql`${t.contactType} in ('email', 'whatsapp')`),
    check('subscribers_locale_check', sql`${t.locale} in ('ar', 'en')`),
  ],
);

/**
 * The media library (D-044): images a site's staff uploaded, already resized and stripped of
 * camera data by the dashboard. Files live in R2 under the site's private space; a file becomes
 * public only when published content uses it (published_at).
 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: siteRef(),
    kind: text('kind').notNull().default('image'),
    /** The uploaded file's name, for finding it again; never shown on the website. */
    name: text('name').notNull(),
    /** Text alternative in each language, read out to people who can't see the image. */
    alt: jsonb('alt').notNull().default({ ar: '', en: '' }),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** The stored widths, smallest first: [{ width, height, bytes }]. */
    variants: jsonb('variants').notNull(),
    bytes: integer('bytes').notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    index('media_assets_site_idx').on(t.siteId, t.createdAt),
    check('media_assets_kind_check', sql`${t.kind} in ('image')`),
  ],
);

/**
 * Announcements to a site's email sign-ups (D-040): written in the dashboard, sent in small
 * chunks within the daily sending limit, so a large list is spread over days. Each delivery is
 * recorded once per subscriber, which lets sending stop and resume without sending twice.
 */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: siteRef(),
    /** { subject: {ar, en}, body: {ar, en} }, validated by the API. */
    content: jsonb('content').notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    status: text('status').notNull().default('sending'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('announcements_site_idx').on(t.siteId, t.createdAt),
    check('announcements_status_check', sql`${t.status} in ('sending', 'finished', 'cancelled')`),
  ],
);

export const announcementDeliveries = pgTable(
  'announcement_deliveries',
  {
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    // An unsubscribe removes the sign-up and its delivery records.
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.announcementId, t.subscriberId] }),
    index('announcement_deliveries_sent_idx').on(t.sentAt),
    check('announcement_deliveries_status_check', sql`${t.status} in ('sent', 'failed')`),
  ],
);

/** Fixed-window rate limits for public endpoints, per site, shared across Worker instances. */
export const formRateLimits = pgTable(
  'form_rate_limits',
  {
    siteId: siteRef(),
    key: text('key').notNull(),
    count: integer('count').notNull(),
    windowStartedAt: bigint('window_started_at', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.key] })],
);
