import { ALL_PERMISSIONS, STANDARD_ROLES } from '@hantex/shared';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createPoolDb, type Database } from './client';
import type { AppDbRole } from './roles';
import {
  auditLog,
  documentDrafts,
  documentVersions,
  invitations,
  roleAssignments,
  rolePermissions,
  roles,
  sessions,
  siteDomains,
  sites,
  subscribers,
  users,
} from './schema';
import { FIRST_SITE, ensureSite, resetStandardRole, syncStandardRoles } from './seed';
import { createOwnerSetupInvitation } from './setup-owner';

const databaseUrl = inject('databaseUrl');
const rolePasswords = inject('rolePasswords');

let owner: ReturnType<typeof createPoolDb>;
let db: Database;
/** The seeded Hantex Ultra site and a second site, for isolation tests. */
let siteA: string;
let siteB: string;

beforeAll(async () => {
  owner = createPoolDb(databaseUrl);
  db = owner.db;
  siteA = await ensureSite(db, FIRST_SITE);
  siteB = await ensureSite(db, {
    key: 'second-brand',
    name: { ar: 'Second', en: 'Second' },
    locales: ['en'],
    defaultLocale: 'en',
    template: 'product-showcase',
  });
});
afterAll(async () => {
  await owner.close();
});

/** Runs a query as one of the application's database users. */
async function asRole(role: AppDbRole, query: string, params: unknown[] = []) {
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = rolePasswords[role];
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await client.query(query, params);
  } finally {
    await client.end();
  }
}

const permissionDenied = /permission denied/;

describe('migrations', () => {
  it('create every table', async () => {
    const result = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_name <> '__drizzle_migrations' order by 1`,
    );
    expect(result.rows.map((r) => r.table_name)).toEqual([
      'accounts',
      'announcement_deliveries',
      'announcements',
      'audit_log',
      'auth_rate_limits',
      'dashboard_rate_limits',
      'document_drafts',
      'document_versions',
      'email_challenges',
      'enrolment_tickets',
      'fonts',
      'form_rate_limits',
      'invitations',
      'media_assets',
      'passkeys',
      'publish_jobs',
      'recovery_codes',
      'role_assignments',
      'role_permissions',
      'roles',
      'sessions',
      'site_domains',
      'sites',
      'subscribers',
      'theme_presets',
      'users',
      'verifications',
    ]);
  });
});

describe('standard roles seed', () => {
  const permissionsOf = async (roleId: string) =>
    (await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId)))
      .map((r) => r.permission)
      .sort();

  it('creates the six standard roles with their approved permissions', async () => {
    for (const role of STANDARD_ROLES) {
      expect(await permissionsOf(role.id)).toEqual([...role.permissions].sort());
    }
  });

  it('keeps permissions an Owner changed, but always restores the locked Owner role', async () => {
    await db
      .delete(rolePermissions)
      .where(
        sql`${rolePermissions.roleId} = 'editor' and ${rolePermissions.permission} = 'comingSoon.edit'`,
      );
    await db
      .delete(rolePermissions)
      .where(
        sql`${rolePermissions.roleId} = 'owner' and ${rolePermissions.permission} = 'audit.view'`,
      );
    await syncStandardRoles(db);
    expect(await permissionsOf('editor')).not.toContain('comingSoon.edit');
    expect(await permissionsOf('owner')).toEqual([...ALL_PERMISSIONS].sort());
    await resetStandardRole(db, 'editor');
    expect(await permissionsOf('editor')).toContain('comingSoon.edit');
  });

  it('removes permissions that no longer exist in code', async () => {
    await db.insert(rolePermissions).values({ roleId: 'viewer', permission: 'retired.permission' });
    await syncStandardRoles(db);
    expect(await permissionsOf('viewer')).not.toContain('retired.permission');
  });
});

describe('constraints', () => {
  it('treats staff emails as case-insensitive unique', async () => {
    await db.insert(users).values({ id: 'u-case-1', name: 'A', email: 'Staff@Example.com' });
    await expect(
      db.insert(users).values({ id: 'u-case-2', name: 'B', email: 'staff@example.com' }),
    ).rejects.toThrow();
  });

  it('rejects unknown status values', async () => {
    await expect(
      db
        .insert(users)
        .values({ id: 'u-bad', name: 'X', email: 'x@example.com', status: 'superuser' }),
    ).rejects.toThrow();
  });

  it('does not let a role that is in use be deleted', async () => {
    await db.insert(users).values({ id: 'u-role', name: 'R', email: 'r@example.com' });
    await db.insert(roleAssignments).values({ userId: 'u-role', roleId: 'viewer', siteId: siteA });
    await expect(db.delete(roles).where(eq(roles.id, 'viewer'))).rejects.toThrow();
  });

  it('removes sessions when a staff member is deleted', async () => {
    await db.insert(users).values({ id: 'u-cascade', name: 'C', email: 'c@example.com' });
    await db.insert(sessions).values({
      id: 's1',
      userId: 'u-cascade',
      token: 't1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.delete(users).where(eq(users.id, 'u-cascade'));
    expect(await db.select().from(sessions).where(eq(sessions.id, 's1'))).toEqual([]);
  });

  it('allows one sign-up per contact on each site', async () => {
    const row = {
      siteId: siteA,
      contactType: 'email',
      contactValue: 'dup@example.com',
      locale: 'ar',
      consentVersion: 'v1',
    };
    await db.insert(subscribers).values(row);
    await expect(db.insert(subscribers).values(row)).rejects.toThrow();
    await db.insert(subscribers).values({ ...row, siteId: siteB });
  });
});

describe('sites (D-024)', () => {
  it('seeds Hantex Ultra in Coming Soon mode with pending domains', async () => {
    const [site] = await db.select().from(sites).where(eq(sites.key, 'hantex-ultra'));
    expect(site).toMatchObject({ mode: 'coming-soon', defaultLocale: 'ar', locales: ['ar', 'en'] });
    const domains = await db.select().from(siteDomains).where(eq(siteDomains.siteId, siteA));
    expect(domains.map((d) => [d.hostname, d.isPrimary, d.status]).sort()).toEqual([
      ['hantexultra.com', false, 'pending'],
      ['www.hantexultra.com', true, 'pending'],
    ]);
  });

  it('never overwrites an existing site when seeding again', async () => {
    await db.update(sites).set({ nameEn: 'Renamed in the dashboard' }).where(eq(sites.id, siteA));
    expect(await ensureSite(db, FIRST_SITE)).toBe(siteA);
    const [site] = await db.select().from(sites).where(eq(sites.id, siteA));
    expect(site?.nameEn).toBe('Renamed in the dashboard');
  });

  it('rejects invalid keys, modes and languages', async () => {
    const base = {
      nameAr: 'X',
      nameEn: 'X',
      locales: ['en'],
      defaultLocale: 'en',
      template: 'coming-soon',
    };
    await expect(db.insert(sites).values({ ...base, key: 'Bad Key' })).rejects.toThrow();
    await expect(
      db.insert(sites).values({ ...base, key: 'ok-key', mode: 'open' }),
    ).rejects.toThrow();
    await expect(
      db.insert(sites).values({ ...base, key: 'ok-key', defaultLocale: 'ar' }),
    ).rejects.toThrow();
    await expect(
      db.insert(sites).values({ ...base, key: 'ok-key', locales: ['fr'], defaultLocale: 'fr' }),
    ).rejects.toThrow();
  });

  it('gives a hostname to one site only, and one primary domain per site', async () => {
    await expect(
      db.insert(siteDomains).values({ siteId: siteB, hostname: 'www.hantexultra.com' }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(siteDomains)
        .values({ siteId: siteA, hostname: 'shop.example.com', isPrimary: true }),
    ).rejects.toThrow();
    await expect(
      db.insert(siteDomains).values({ siteId: siteB, hostname: 'https://example.com' }),
    ).rejects.toThrow();
  });

  it('keeps drafts and version numbers separate per site', async () => {
    await db.insert(documentDrafts).values({ siteId: siteA, kind: 'coming-soon', data: {} });
    await db.insert(documentDrafts).values({ siteId: siteB, kind: 'coming-soon', data: {} });
    await db
      .insert(documentVersions)
      .values({ siteId: siteA, kind: 'coming-soon', version: 1, data: {} });
    await db
      .insert(documentVersions)
      .values({ siteId: siteB, kind: 'coming-soon', version: 1, data: {} });
    await expect(
      db
        .insert(documentVersions)
        .values({ siteId: siteA, kind: 'coming-soon', version: 1, data: {} }),
    ).rejects.toThrow();
  });

  it('keeps a draft and version numbers per page (D-035)', async () => {
    for (const key of ['page01', 'page02']) {
      await db.insert(documentDrafts).values({ siteId: siteA, kind: 'page', key, data: {} });
      await db
        .insert(documentVersions)
        .values({ siteId: siteA, kind: 'page', key, version: 1, data: {} });
    }
    await expect(
      db.insert(documentDrafts).values({ siteId: siteA, kind: 'page', key: 'page01', data: {} }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(documentVersions)
        .values({ siteId: siteA, kind: 'page', key: 'page01', version: 1, data: {} }),
    ).rejects.toThrow();
    await expect(
      db.insert(documentDrafts).values({ siteId: siteA, kind: 'script', data: {} }),
    ).rejects.toThrow();
  });

  it('cannot delete a site that has records', async () => {
    await expect(db.delete(sites).where(eq(sites.id, siteA))).rejects.toThrow();
  });
});

describe('first-Owner setup invitation', () => {
  it('stores only a hash, replaces earlier links, and closes once an Owner exists', async () => {
    const first = await createOwnerSetupInvitation(db, {
      email: 'Owner@Example.com',
      appOrigin: 'https://admin.example.test',
    });
    const token = new URL(first.link).hash.replace('#token=', '');
    expect(first.link.startsWith('https://admin.example.test/accept-invitation#token=')).toBe(true);
    expect(first.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);
    const rows = await db
      .select()
      .from(invitations)
      .where(eq(invitations.email, 'owner@example.com'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toContain(token);
    expect(rows[0]).toMatchObject({ roleId: 'owner', siteId: null, invitedBy: null });

    await createOwnerSetupInvitation(db, {
      email: 'owner@example.com',
      appOrigin: 'https://admin.example.test',
    });
    const after = await db
      .select()
      .from(invitations)
      .where(eq(invitations.email, 'owner@example.com'));
    expect(after.filter((r) => r.revokedAt === null)).toHaveLength(1);

    await expect(
      createOwnerSetupInvitation(db, {
        email: 'x@example.com',
        appOrigin: 'http://admin.example.test',
      }),
    ).rejects.toThrow(/https/);

    await db
      .insert(users)
      .values({ id: 'u-first-owner', name: 'O', email: 'first-owner@example.com' });
    await db
      .insert(roleAssignments)
      .values({ userId: 'u-first-owner', roleId: 'owner', siteId: null });
    await expect(
      createOwnerSetupInvitation(db, {
        email: 'late@example.com',
        appOrigin: 'https://admin.example.test',
      }),
    ).rejects.toThrow(/already exists/);
  });
});

describe('role assignments (D-025)', () => {
  const person = async (id: string) => {
    await db.insert(users).values({ id, name: id, email: `${id}@example.com` });
  };
  const constraintOf = (error: unknown) =>
    (error as { cause?: { constraint?: string } }).cause?.constraint;

  it('allows one role per site, on several sites', async () => {
    await person('u-multi');
    await db.insert(roleAssignments).values([
      { userId: 'u-multi', roleId: 'content-manager', siteId: siteA },
      { userId: 'u-multi', roleId: 'viewer', siteId: siteB },
    ]);
    await expect(
      db.insert(roleAssignments).values({ userId: 'u-multi', roleId: 'editor', siteId: siteA }),
    ).rejects.toThrow();
  });

  it('allows only one all-sites assignment', async () => {
    await person('u-all');
    await db
      .insert(roleAssignments)
      .values({ userId: 'u-all', roleId: 'administrator', siteId: null });
    await expect(
      db.insert(roleAssignments).values({ userId: 'u-all', roleId: 'viewer', siteId: null }),
    ).rejects.toThrow();
  });

  it('never mixes all-sites and per-site assignments', async () => {
    await person('u-mixed');
    await db.insert(roleAssignments).values({ userId: 'u-mixed', roleId: 'viewer', siteId: siteA });
    const error = await db
      .insert(roleAssignments)
      .values({ userId: 'u-mixed', roleId: 'viewer', siteId: null })
      .catch((e: unknown) => e);
    expect(constraintOf(error)).toBe('role_assignments_single_scope');
  });

  it('keeps Owners on all sites, for assignments and invitations', async () => {
    await person('u-owner-site');
    const error = await db
      .insert(roleAssignments)
      .values({ userId: 'u-owner-site', roleId: 'owner', siteId: siteA })
      .catch((e: unknown) => e);
    expect(constraintOf(error)).toBe('role_assignments_owner_all_sites');
    await db
      .insert(roleAssignments)
      .values({ userId: 'u-owner-site', roleId: 'owner', siteId: null });

    const invite = {
      email: 'new-owner@example.com',
      roleId: 'owner',
      tokenHash: 'hash-owner-site',
      expiresAt: new Date(Date.now() + 60_000),
    };
    const inviteError = await db
      .insert(invitations)
      .values({ ...invite, siteId: siteA })
      .catch((e: unknown) => e);
    expect(constraintOf(inviteError)).toBe('invitations_owner_all_sites');
    await db.insert(invitations).values({ ...invite, siteId: null });
  });

  it('cannot move an assignment into a forbidden scope with an update', async () => {
    await person('u-update');
    await db
      .insert(roleAssignments)
      .values({ userId: 'u-update', roleId: 'viewer', siteId: siteA });
    const error = await db
      .update(roleAssignments)
      .set({ roleId: 'owner' })
      .where(eq(roleAssignments.userId, 'u-update'))
      .catch((e: unknown) => e);
    expect(constraintOf(error)).toBe('role_assignments_owner_all_sites');
  });
});

describe('least-privilege database users', () => {
  it('lets the public site add a sign-up but never read, change or delete sign-ups', async () => {
    const signUp = `insert into subscribers (site_id, contact_type, contact_value, locale, consent_version) values ($1, 'whatsapp', '+963933000001', 'ar', 'v1') on conflict do nothing`;
    expect((await asRole('hantex_public_app', signUp, [siteA])).rowCount).toBe(1);
    expect((await asRole('hantex_public_app', signUp, [siteA])).rowCount).toBe(0);
    await expect(asRole('hantex_public_app', 'select * from sites')).rejects.toThrow(
      permissionDenied,
    );
    await expect(asRole('hantex_public_app', 'select * from subscribers')).rejects.toThrow(
      permissionDenied,
    );
    await expect(asRole('hantex_public_app', 'delete from subscribers')).rejects.toThrow(
      permissionDenied,
    );
    await expect(asRole('hantex_public_app', 'select * from users')).rejects.toThrow(
      permissionDenied,
    );
  });

  it('lets the public site remove exactly one sign-up of its own site, through unsubscribe() only', async () => {
    const owner = await db.execute<{ id: string }>(
      sql`insert into subscribers (site_id, contact_type, contact_value, locale, consent_version) values (${siteA}, 'email', 'leave@example.test', 'en', 'v1') returning id`,
    );
    const id = owner.rows[0]!.id;
    // The wrong site can't remove it; the right one can, once.
    const call = 'select unsubscribe($1, $2) as removed';
    const otherSite = await db.execute<{ id: string }>(
      sql`select id from sites where id <> ${siteA} limit 1`,
    );
    if (otherSite.rows[0]) {
      expect((await asRole('hantex_public_app', call, [otherSite.rows[0].id, id])).rows[0]).toEqual(
        {
          removed: false,
        },
      );
    }
    expect((await asRole('hantex_public_app', call, [siteA, id])).rows[0]).toEqual({
      removed: true,
    });
    expect((await asRole('hantex_public_app', call, [siteA, id])).rows[0]).toEqual({
      removed: false,
    });
    // The dashboard user can't call it; it deletes through its own, audited route.
    await expect(asRole('hantex_admin_app', call, [siteA, id])).rejects.toThrow(permissionDenied);
  });

  it('keeps the audit log append-only for the dashboard', async () => {
    await asRole(
      'hantex_admin_app',
      `insert into audit_log (actor_label, action) values ('test', 'test.append')`,
    );
    const rows = await asRole(
      'hantex_admin_app',
      `select action from audit_log where action = 'test.append'`,
    );
    expect(rows.rowCount).toBe(1);
    await expect(asRole('hantex_admin_app', `update audit_log set action = 'x'`)).rejects.toThrow(
      permissionDenied,
    );
    await expect(asRole('hantex_admin_app', 'delete from audit_log')).rejects.toThrow(
      permissionDenied,
    );
  });

  it('keeps published versions immutable for the dashboard', async () => {
    await db
      .insert(documentVersions)
      .values({ siteId: siteA, kind: 'theme', version: 1, data: {} });
    await expect(
      asRole('hantex_admin_app', `update document_versions set data = '{}'`),
    ).rejects.toThrow(permissionDenied);
    await expect(asRole('hantex_admin_app', 'delete from document_versions')).rejects.toThrow(
      permissionDenied,
    );
  });

  it('does not let the dashboard create sign-ups', async () => {
    await expect(
      asRole(
        'hantex_admin_app',
        `insert into subscribers (site_id, contact_type, contact_value, locale, consent_version) values ($1, 'email', 'a@b.co', 'ar', 'v1')`,
        [siteA],
      ),
    ).rejects.toThrow(permissionDenied);
  });

  it('limits the build user to published content and site configuration', async () => {
    expect(
      (await asRole('hantex_build', 'select kind from document_versions')).rowCount,
    ).toBeGreaterThan(0);
    expect((await asRole('hantex_build', 'select key from sites')).rowCount).toBeGreaterThan(0);
    await expect(asRole('hantex_build', 'select * from role_assignments')).rejects.toThrow(
      permissionDenied,
    );
    await expect(asRole('hantex_build', 'select * from users')).rejects.toThrow(permissionDenied);
    await expect(asRole('hantex_build', 'select * from subscribers')).rejects.toThrow(
      permissionDenied,
    );
    // Published images: only what a page needs to draw them, not file names or uploaders.
    await asRole(
      'hantex_build',
      'select id, width, height, variants, alt, published_at from media_assets',
    );
    await expect(asRole('hantex_build', 'select name from media_assets')).rejects.toThrow(
      permissionDenied,
    );
    await expect(asRole('hantex_build', 'select created_by from media_assets')).rejects.toThrow(
      permissionDenied,
    );
    // Uploaded fonts: their files and scripts, not who confirmed the licence.
    await asRole('hantex_build', 'select id, family, scripts, files from fonts');
    await expect(asRole('hantex_build', 'select licence_confirmed_by from fonts')).rejects.toThrow(
      permissionDenied,
    );
    await expect(asRole('hantex_build', 'delete from fonts')).rejects.toThrow(permissionDenied);
  });

  it('gives the backup user read access to everything and nothing else', async () => {
    expect((await asRole('hantex_backup', 'select count(*) from audit_log')).rowCount).toBe(1);
    await expect(
      asRole('hantex_backup', `insert into audit_log (actor_label, action) values ('x', 'x')`),
    ).rejects.toThrow(permissionDenied);
  });

  it('never lets the dashboard delete a site', async () => {
    await expect(
      asRole('hantex_admin_app', 'delete from sites where id = $1', [siteB]),
    ).rejects.toThrow(permissionDenied);
    const archived = await asRole(
      'hantex_admin_app',
      'update sites set archived_at = now() where id = $1',
      [siteB],
    );
    expect(archived.rowCount).toBe(1);
    await db.update(sites).set({ archivedAt: null }).where(eq(sites.id, siteB));
  });

  it('records audit entries with the dashboard user', async () => {
    const before = await db.select().from(auditLog);
    expect(before.length).toBeGreaterThan(0);
  });
});
