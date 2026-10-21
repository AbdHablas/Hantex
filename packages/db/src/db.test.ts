import { ALL_PERMISSIONS, STANDARD_ROLES } from '@hantex/shared';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createPoolDb, type Database } from './client';
import type { AppDbRole } from './roles';
import {
  auditLog,
  documentVersions,
  rolePermissions,
  roles,
  sessions,
  subscribers,
  userRoles,
  users,
} from './schema';
import { resetStandardRole, syncStandardRoles } from './seed';

const databaseUrl = inject('databaseUrl');
const rolePasswords = inject('rolePasswords');

let owner: ReturnType<typeof createPoolDb>;
let db: Database;

beforeAll(() => {
  owner = createPoolDb(databaseUrl);
  db = owner.db;
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
      'audit_log',
      'auth_rate_limits',
      'document_drafts',
      'document_versions',
      'form_rate_limits',
      'invitations',
      'passkeys',
      'publish_jobs',
      'recovery_codes',
      'role_permissions',
      'roles',
      'sessions',
      'subscribers',
      'user_roles',
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
    await db.insert(userRoles).values({ userId: 'u-role', roleId: 'viewer' });
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

  it('allows one sign-up per contact', async () => {
    const row = {
      contactType: 'email',
      contactValue: 'dup@example.com',
      locale: 'ar',
      consentVersion: 'v1',
    };
    await db.insert(subscribers).values(row);
    await expect(db.insert(subscribers).values(row)).rejects.toThrow();
  });
});

describe('least-privilege database users', () => {
  it('lets the public site add a sign-up but never read, change or delete sign-ups', async () => {
    const insert = await asRole(
      'hantex_public_app',
      `insert into subscribers (contact_type, contact_value, locale, consent_version) values ('whatsapp', '+963933000001', 'ar', 'v1') on conflict do nothing`,
    );
    expect(insert.rowCount).toBe(1);
    const duplicate = await asRole(
      'hantex_public_app',
      `insert into subscribers (contact_type, contact_value, locale, consent_version) values ('whatsapp', '+963933000001', 'ar', 'v1') on conflict do nothing`,
    );
    expect(duplicate.rowCount).toBe(0);
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
    await db.insert(documentVersions).values({ kind: 'theme', version: 1, data: {} });
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
        `insert into subscribers (contact_type, contact_value, locale, consent_version) values ('email', 'a@b.co', 'ar', 'v1')`,
      ),
    ).rejects.toThrow(permissionDenied);
  });

  it('limits the build user to published content', async () => {
    expect(
      (await asRole('hantex_build', 'select kind from document_versions')).rowCount,
    ).toBeGreaterThan(0);
    await expect(asRole('hantex_build', 'select * from users')).rejects.toThrow(permissionDenied);
    await expect(asRole('hantex_build', 'select * from subscribers')).rejects.toThrow(
      permissionDenied,
    );
  });

  it('gives the backup user read access to everything and nothing else', async () => {
    expect((await asRole('hantex_backup', 'select count(*) from audit_log')).rowCount).toBe(1);
    await expect(
      asRole('hantex_backup', `insert into audit_log (actor_label, action) values ('x', 'x')`),
    ).rejects.toThrow(permissionDenied);
  });

  it('records audit entries with the dashboard user', async () => {
    const before = await db.select().from(auditLog);
    expect(before.length).toBeGreaterThan(0);
  });
});
