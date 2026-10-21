import {
  auditLog,
  documentDrafts,
  documentVersions,
  invitations,
  roleAssignments,
  sessions,
  siteDomains,
  sites,
  subscribers,
  themePresets,
  users,
} from '@hantex/db/worker';
import { brandTheme, neutralTheme } from '@hantex/theme';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTicket } from '../src/auth/tickets';
import { enrolmentHooks } from '../src/auth/enrolment';
import { createHarness, type Harness } from './harness';

const A = 'hantex-ultra';
const B = 'second-brand';

let h: Harness;
let owner: string;
let adminAll: string;
let adminA: string;
let contentA: string;

beforeAll(async () => {
  h = await createHarness();
  owner = await h.staff('ss-owner', [{ roleId: 'owner', site: null }]);
  adminAll = await h.staff('ss-admin-all', [{ roleId: 'administrator', site: null }]);
  adminA = await h.staff('ss-admin-a', [{ roleId: 'administrator', site: 'a' }]);
  contentA = await h.staff('ss-content-a', [{ roleId: 'content-manager', site: 'a' }]);
});
afterAll(() => h.close());

const json = async <T>(response: Response) => (await response.json()) as T;

describe('cross-site isolation', () => {
  it('lists, exports and deletes sign-ups only on their own site', async () => {
    const [onA] = await h.db
      .insert(subscribers)
      .values({
        siteId: h.sites.a,
        contactType: 'email',
        contactValue: 'only-a@example.test',
        locale: 'ar',
        consentVersion: 'v1',
      })
      .returning();
    const [onB] = await h.db
      .insert(subscribers)
      .values({
        siteId: h.sites.b,
        contactType: 'email',
        contactValue: 'only-b@example.test',
        locale: 'en',
        consentVersion: 'v1',
      })
      .returning();

    const listA = await json<{ subscribers: { contactValue: string }[] }>(
      await h.request('GET', `/api/sites/${A}/subscribers`, { cookie: adminA }),
    );
    expect(listA.subscribers.map((s) => s.contactValue)).toContain('only-a@example.test');
    expect(listA.subscribers.map((s) => s.contactValue)).not.toContain('only-b@example.test');

    const csv = await (
      await h.request('GET', `/api/sites/${A}/subscribers/export`, { cookie: adminA })
    ).text();
    expect(csv).toContain('only-a@example.test');
    expect(csv).not.toContain('only-b@example.test');

    // Another site's record through this site's address is "not found", even for an Owner.
    const cross = await h.request('DELETE', `/api/sites/${A}/subscribers/${onB!.id}`, {
      cookie: owner,
    });
    expect(cross.status).toBe(404);
    expect(await h.db.select().from(subscribers).where(eq(subscribers.id, onB!.id))).toHaveLength(
      1,
    );

    const own = await h.request('DELETE', `/api/sites/${A}/subscribers/${onA!.id}`, {
      cookie: adminA,
    });
    expect(own.status).toBe(200);
  });

  it('publishes and numbers versions per site, and rebuilds only that site', async () => {
    h.dispatched.length = 0;
    const publish = (site: string) =>
      h.request('POST', `/api/sites/${site}/documents/site-settings/publish`, {
        cookie: owner,
        body: {},
      });
    const first = await json<{ version: number }>(await publish(B));
    const second = await json<{ version: number }>(await publish(B));
    expect(second.version).toBe(first.version + 1);
    expect(h.dispatched.map((d) => d.siteKey)).toEqual([B, B]);

    const versionsA = await h.db
      .select()
      .from(documentVersions)
      .where(
        and(eq(documentVersions.siteId, h.sites.a), eq(documentVersions.kind, 'site-settings')),
      );
    expect(versionsA.every((v) => v.version !== second.version || v.siteId === h.sites.a)).toBe(
      true,
    );
  });

  it('counts only its own sign-ups on the overview, by day and by channel', async () => {
    await h.db.insert(subscribers).values({
      siteId: h.sites.b,
      contactType: 'whatsapp',
      contactValue: '+963900000001',
      locale: 'ar',
      consentVersion: 'v1',
    });
    const ofA = await h.db.select().from(subscribers).where(eq(subscribers.siteId, h.sites.a));
    const overview = await json<{
      subscribers: {
        total: number;
        daily: { day: string; n: number }[];
        byType: Record<string, number>;
      };
    }>(await h.request('GET', `/api/sites/${A}/overview`, { cookie: adminA }));
    expect(overview.subscribers.total).toBe(ofA.length);
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    expect(sum(overview.subscribers.daily.map((d) => d.n))).toBe(ofA.length);
    expect(sum(Object.values(overview.subscribers.byType))).toBe(ofA.length);
    expect(overview.subscribers.byType['whatsapp'] ?? 0).toBe(
      ofA.filter((s) => s.contactType === 'whatsapp').length,
    );
    const today = new Date().toISOString().slice(0, 10);
    if (ofA.length > 0) expect(overview.subscribers.daily.at(-1)?.day).toBe(today);
  });

  it('keeps drafts separate per site', async () => {
    const draft = await json<{ draft: { seo: { title: { en: string } } } }>(
      await h.request('GET', `/api/sites/${B}/documents/site-settings`, { cookie: owner }),
    );
    const changed = {
      ...draft.draft,
      seo: { ...draft.draft.seo, title: { ar: 'B', en: 'Only on B' } },
    };
    expect(
      (
        await h.request('PUT', `/api/sites/${B}/documents/site-settings/draft`, {
          cookie: owner,
          body: changed,
        })
      ).status,
    ).toBe(200);
    const onA = await json<{ draft: { seo: { title: { en: string } } } }>(
      await h.request('GET', `/api/sites/${A}/documents/site-settings`, { cookie: owner }),
    );
    expect(onA.draft.seo.title.en).not.toBe('Only on B');
  });

  it('records the site on audit entries and shows a site only its own entries', async () => {
    const entries = await json<{ entries: { siteId: string | null }[] }>(
      await h.request('GET', `/api/sites/${A}/audit?limit=100`, { cookie: adminA }),
    );
    expect(entries.entries.length).toBeGreaterThan(0);
    expect(entries.entries.every((e) => e.siteId === h.sites.a)).toBe(true);
  });
});

describe('request protection', () => {
  it('rejects state-changing requests from another origin or without one', async () => {
    for (const origin of ['https://evil.example', null]) {
      const response = await h.request('PUT', `/api/sites/${A}/documents/coming-soon/draft`, {
        cookie: owner,
        origin,
        body: {},
      });
      expect(response.status).toBe(403);
    }
  });

  it('signs out disabled staff immediately', async () => {
    const cookie = await h.staff('ss-to-disable', [{ roleId: 'viewer', site: 'a' }]);
    expect((await h.request('GET', `/api/sites/${A}/overview`, { cookie })).status).toBe(200);
    expect(
      (await h.request('POST', '/api/staff/ss-to-disable/disable', { cookie: adminAll })).status,
    ).toBe(200);
    expect((await h.request('GET', `/api/sites/${A}/overview`, { cookie })).status).toBe(401);
    expect(await h.db.select().from(sessions).where(eq(sessions.userId, 'ss-to-disable'))).toEqual(
      [],
    );
  });

  it('never lets a per-site administrator disable accounts (that affects every site)', async () => {
    await h.staff('ss-victim', [{ roleId: 'viewer', site: 'a' }]);
    const response = await h.request('POST', '/api/staff/ss-victim/disable', { cookie: adminA });
    expect(response.status).toBe(403);
  });
});

describe('staff changes per site (D-025)', () => {
  const invite = (cookie: string, path: string, roleId: string, email: string) =>
    h.request('POST', path, { cookie, body: { email, name: '', roleId } });

  it('lets a per-site administrator invite lower roles to their own site only', async () => {
    const ok = await invite(
      adminA,
      `/api/sites/${A}/staff/invitations`,
      'editor',
      'new-editor@example.test',
    );
    expect(ok.status).toBe(201);
    const [row] = await h.db
      .select()
      .from(invitations)
      .where(eq(invitations.email, 'new-editor@example.test'));
    expect(row?.siteId).toBe(h.sites.a);
    expect(h.mail.sent.at(-1)?.text).toContain('Hantex Ultra');

    expect(
      (await invite(adminA, `/api/sites/${B}/staff/invitations`, 'editor', 'b@example.test'))
        .status,
    ).toBe(404);
    expect(
      (await invite(adminA, '/api/staff/invitations', 'editor', 'all@example.test')).status,
    ).toBe(403);
  });

  it('stops anyone below Owner inviting Owners or Administrators', async () => {
    for (const roleId of ['owner', 'administrator']) {
      const response = await invite(
        adminA,
        `/api/sites/${A}/staff/invitations`,
        roleId,
        `${roleId}-x@example.test`,
      );
      expect(response.status).toBe(403);
      expect(await json<{ error: string }>(response)).toEqual({ error: 'protected-role' });
    }
  });

  it('never invites an Owner for a single site', async () => {
    const response = await invite(
      owner,
      `/api/sites/${A}/staff/invitations`,
      'owner',
      'site-owner@example.test',
    );
    expect(response.status).toBe(403);
    expect(await json<{ error: string }>(response)).toEqual({ error: 'owner-all-sites' });
  });

  it('stops a content manager inviting anyone', async () => {
    const response = await invite(
      contentA,
      `/api/sites/${A}/staff/invitations`,
      'viewer',
      'v@example.test',
    );
    expect(response.status).toBe(403);
  });

  it('gives an existing person a role on another site, and removes it again', async () => {
    await h.staff('ss-multi', [{ roleId: 'viewer', site: 'a' }]);
    const put = await h.request('PUT', `/api/sites/${B}/staff/ss-multi/role`, {
      cookie: owner,
      body: { roleId: 'editor' },
    });
    expect(put.status).toBe(200);
    const rows = await h.db
      .select()
      .from(roleAssignments)
      .where(eq(roleAssignments.userId, 'ss-multi'));
    expect(rows.map((r) => [r.siteId, r.roleId]).sort()).toEqual(
      [
        [h.sites.a, 'viewer'],
        [h.sites.b, 'editor'],
      ].sort(),
    );
    const removed = await h.request('DELETE', `/api/sites/${B}/staff/ss-multi/role`, {
      cookie: owner,
    });
    expect(removed.status).toBe(200);
    expect(
      await h.db.select().from(roleAssignments).where(eq(roleAssignments.userId, 'ss-multi')),
    ).toHaveLength(1);
  });

  it('never mixes an all-sites role with per-site roles', async () => {
    const response = await h.request('PUT', `/api/sites/${A}/staff/ss-admin-all/role`, {
      cookie: owner,
      body: { roleId: 'viewer' },
    });
    expect(response.status).toBe(403);
    expect(await json<{ error: string }>(response)).toEqual({ error: 'mixed-scope' });
  });

  it('stops a per-site administrator changing an all-sites administrator', async () => {
    const response = await h.request('DELETE', `/api/sites/${A}/staff/ss-admin-all/role`, {
      cookie: adminA,
    });
    expect(response.status).toBe(403);
  });

  it('stops anyone changing their own access', async () => {
    const response = await h.request('PUT', `/api/sites/${A}/staff/ss-admin-a/role`, {
      cookie: adminA,
      body: { roleId: 'viewer' },
    });
    expect(response.status).toBe(403);
    expect(await json<{ error: string }>(response)).toEqual({ error: 'self-change' });
  });

  it('protects the last Owner', async () => {
    const response = await h.request('PUT', '/api/staff/ss-owner/role', {
      cookie: owner,
      body: { roleId: 'viewer' },
    });
    expect(response.status).toBe(403);
  });

  it('turns per-site roles into one all-sites role when an Owner sets one', async () => {
    await h.staff('ss-promote', [
      { roleId: 'viewer', site: 'a' },
      { roleId: 'viewer', site: 'b' },
    ]);
    const response = await h.request('PUT', '/api/staff/ss-promote/role', {
      cookie: owner,
      body: { roleId: 'editor' },
    });
    expect(response.status).toBe(200);
    const rows = await h.db
      .select()
      .from(roleAssignments)
      .where(eq(roleAssignments.userId, 'ss-promote'));
    expect(rows.map((r) => [r.siteId, r.roleId])).toEqual([[null, 'editor']]);
  });

  it('creates the account with a role on the invited site when the invitation is accepted', async () => {
    const [invitation] = await h.db
      .insert(invitations)
      .values({
        email: 'accepts@example.test',
        roleId: 'editor',
        siteId: h.sites.b,
        tokenHash: 'hash-accepts',
        invitedBy: 'ss-owner',
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    const { ticket } = await createTicket(h.db, {
      purpose: 'invitation',
      userId: 'ss-accepted',
      invitationId: invitation!.id,
    });
    const hooks = enrolmentHooks(h.db);
    await hooks.afterRegistration({
      context: ticket,
      user: { id: 'ss-accepted' },
      userVerified: true,
    });
    const rows = await h.db
      .select()
      .from(roleAssignments)
      .where(eq(roleAssignments.userId, 'ss-accepted'));
    expect(rows.map((r) => [r.siteId, r.roleId])).toEqual([[h.sites.b, 'editor']]);
    const [entry] = await h.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.action, 'staff.invitation.accepted'), eq(auditLog.targetId, 'ss-accepted')),
      );
    expect(entry?.siteId).toBe(h.sites.b);
    // The ticket is single use.
    await expect(
      hooks.afterRegistration({ context: ticket, user: { id: 'ss-accepted' }, userVerified: true }),
    ).rejects.toThrow();
  });

  it('closes the first-Owner setup invitation once an Owner exists', async () => {
    const [setup] = await h.db
      .insert(invitations)
      .values({
        email: 'late-setup@example.test',
        roleId: 'owner',
        tokenHash: 'hash-late-setup',
        invitedBy: null,
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    const { ticket } = await createTicket(h.db, {
      purpose: 'invitation',
      userId: 'ss-late-setup',
      invitationId: setup!.id,
    });
    await expect(
      enrolmentHooks(h.db).afterRegistration({
        context: ticket,
        user: { id: 'ss-late-setup' },
        userVerified: true,
      }),
    ).rejects.toThrow();
    expect(await h.db.select().from(users).where(eq(users.id, 'ss-late-setup'))).toEqual([]);
  });

  it('refuses passkeys that did not verify the person', async () => {
    const hooks = enrolmentHooks(h.db);
    await expect(
      hooks.afterRegistration({ context: 'x', user: { id: 'x' }, userVerified: false }),
    ).rejects.toThrow();
  });
});

describe('sites (D-024)', () => {
  it('creates new sites in Coming Soon mode only', async () => {
    const body = {
      key: 'ss-new-site',
      name: { ar: 'N', en: 'N' },
      locales: ['ar', 'en'],
      defaultLocale: 'ar',
      template: 'product-showcase',
    };
    expect(
      (await h.request('POST', '/api/sites', { cookie: owner, body: { ...body, mode: 'live' } }))
        .status,
    ).toBe(400);
    expect((await h.request('POST', '/api/sites', { cookie: owner, body })).status).toBe(201);
    expect((await h.request('POST', '/api/sites', { cookie: owner, body })).status).toBe(409);
    const [site] = await h.db.select().from(sites).where(eq(sites.key, 'ss-new-site'));
    expect(site?.mode).toBe('coming-soon');
    // The new site is visible to all-sites staff, and not to per-site staff of other sites.
    expect(
      (await h.request('GET', '/api/sites/ss-new-site/overview', { cookie: adminAll })).status,
    ).toBe(200);
    expect(
      (await h.request('GET', '/api/sites/ss-new-site/overview', { cookie: adminA })).status,
    ).toBe(404);
  });

  it('records domains as pending and never gives one hostname to two sites', async () => {
    const add = (site: string, hostname: string, isPrimary = false) =>
      h.request('POST', `/api/sites/${site}/domains`, {
        cookie: owner,
        body: { hostname, isPrimary },
      });
    const created = await add('ss-new-site', 'WWW.New-Site.Example');
    expect(created.status).toBe(201);
    const [domain] = await h.db
      .select()
      .from(siteDomains)
      .where(eq(siteDomains.hostname, 'www.new-site.example'));
    expect(domain?.status).toBe('pending');
    expect((await add(A, 'www.new-site.example')).status).toBe(409);
    expect((await add('ss-new-site', 'https://bad.example/path')).status).toBe(400);
    expect((await add('ss-new-site', 'shop.new-site.example')).status).toBe(201);
    expect(
      (
        await h.request('POST', `/api/sites/ss-new-site/domains`, {
          cookie: adminAll,
          body: { hostname: 'x.example.com' },
        })
      ).status,
    ).toBe(403);
  });

  it('lets an Owner switch the mode, which rebuilds only that site', async () => {
    h.dispatched.length = 0;
    const response = await h.request('PUT', '/api/sites/ss-new-site/mode', {
      cookie: owner,
      body: { mode: 'maintenance' },
    });
    expect(response.status).toBe(200);
    expect(h.dispatched.map((d) => d.siteKey)).toEqual(['ss-new-site']);
  });

  it('makes an archived site read-only until it is restored', async () => {
    expect(
      (await h.request('POST', '/api/sites/ss-new-site/archive', { cookie: owner })).status,
    ).toBe(200);
    expect(
      (await h.request('GET', '/api/sites/ss-new-site/overview', { cookie: owner })).status,
    ).toBe(200);
    const write = await h.request('PUT', '/api/sites/ss-new-site/documents/coming-soon/draft', {
      cookie: owner,
      body: {},
    });
    expect(write.status).toBe(409);
    expect(
      (await h.request('POST', '/api/sites/ss-new-site/restore', { cookie: owner })).status,
    ).toBe(200);
    const [site] = await h.db.select().from(sites).where(eq(sites.key, 'ss-new-site'));
    expect(site?.archivedAt).toBeNull();
  });
});

describe('theme presets (D-027)', () => {
  const newSite = (key: string, startTheme?: unknown) => ({
    key,
    name: { ar: 'P', en: 'P' },
    locales: ['ar', 'en'],
    defaultLocale: 'ar',
    template: 'product-showcase',
    ...(startTheme ? { startTheme } : {}),
  });
  const themeDraft = async (key: string) => {
    const [site] = await h.db.select().from(sites).where(eq(sites.key, key));
    const [draft] = await h.db
      .select()
      .from(documentDrafts)
      .where(and(eq(documentDrafts.siteId, site!.id), eq(documentDrafts.kind, 'theme')));
    return draft?.data;
  };

  it('lists the built-in presets and only the sites the person may style', async () => {
    const list = await json<{ builtIn: { id: string }[]; sites: { key: string }[] }>(
      await h.request('GET', '/api/theme-presets', { cookie: adminA }),
    );
    expect(list.builtIn.map((p) => p.id)).toEqual(['brand', 'neutral']);
    expect(list.sites.map((s) => s.key)).toEqual([A]);
    const all = await json<{ sites: { key: string }[] }>(
      await h.request('GET', '/api/theme-presets', { cookie: owner }),
    );
    expect(all.sites.map((s) => s.key)).toEqual(expect.arrayContaining([A, B]));
  });

  it('saves presets only for people who may publish a theme, and checks contrast', async () => {
    const preset = { name: { ar: 'تجربة', en: 'Trial' }, theme: neutralTheme };
    expect(
      (await h.request('POST', '/api/theme-presets', { cookie: contentA, body: preset })).status,
    ).toBe(403);
    const unreadable = structuredClone(neutralTheme);
    unreadable.colors.light.text = unreadable.colors.light.background;
    expect(
      (
        await h.request('POST', '/api/theme-presets', {
          cookie: adminA,
          body: { ...preset, theme: unreadable },
        })
      ).status,
    ).toBe(400);
    const created = await h.request('POST', '/api/theme-presets', { cookie: adminA, body: preset });
    expect(created.status).toBe(201);
    const { id } = await json<{ id: string }>(created);
    // Only an Owner may delete a shared preset.
    expect((await h.request('DELETE', `/api/theme-presets/${id}`, { cookie: adminA })).status).toBe(
      403,
    );
    expect((await h.request('DELETE', `/api/theme-presets/${id}`, { cookie: owner })).status).toBe(
      200,
    );
    expect(await h.db.select().from(themePresets).where(eq(themePresets.id, id))).toHaveLength(0);
  });

  it('starts a new site from a preset or another site, as a draft to review', async () => {
    expect(
      (
        await h.request('POST', '/api/sites', {
          cookie: owner,
          body: newSite('ss-preset-site', { preset: 'neutral' }),
        })
      ).status,
    ).toBe(201);
    expect(await themeDraft('ss-preset-site')).toEqual(neutralTheme);

    expect(
      (
        await h.request('POST', '/api/sites', {
          cookie: owner,
          body: newSite('ss-copied-site', { site: A }),
        })
      ).status,
    ).toBe(201);
    expect(await themeDraft('ss-copied-site')).toMatchObject({ logo: brandTheme.logo });

    // An unknown preset creates nothing.
    const bad = await h.request('POST', '/api/sites', {
      cookie: owner,
      body: newSite('ss-bad-preset', { preset: 'missing' }),
    });
    expect(bad.status).toBe(400);
    expect(await h.db.select().from(sites).where(eq(sites.key, 'ss-bad-preset'))).toHaveLength(0);
  });
});

describe('account recovery', () => {
  it('answers the same whether or not the email belongs to staff', async () => {
    const send = (email: string) =>
      h.request('POST', '/api/enrolment/recovery/start', { body: { email, turnstileToken: 't' } });
    const unknown = await send('nobody@example.test');
    const known = await send('ss-content-a@example.test');
    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it('needs a passed Turnstile check', async () => {
    h.turnstile.pass = false;
    const response = await h.request('POST', '/api/enrolment/recovery/start', {
      body: { email: 'ss-content-a@example.test', turnstileToken: 't' },
    });
    h.turnstile.pass = true;
    expect(response.status).toBe(400);
  });

  it('recovers with the emailed code plus a recovery code, each only once', async () => {
    // Recovery codes are issued from a fresh session.
    const cookie = await h.login('ss-content-a');
    const issued = await json<{ codes: string[] }>(
      await h.request('POST', '/api/me/recovery-codes', { cookie }),
    );
    expect(issued.codes).toHaveLength(10);

    await h.request('POST', '/api/enrolment/recovery/start', {
      body: { email: 'ss-content-a@example.test', turnstileToken: 't' },
    });
    const code = /(\d{6})/.exec(h.mail.sent.at(-1)?.text ?? '')?.[1];
    expect(code).toBeDefined();

    const complete = (recoveryCode: string) =>
      h.request('POST', '/api/enrolment/recovery/complete', {
        body: { email: 'ss-content-a@example.test', code, recoveryCode, turnstileToken: 't' },
      });
    const wrong = await complete('AAAAA-AAAAA');
    expect(wrong.status).toBe(400);
    const ok = await complete(issued.codes[0]!.toLowerCase());
    expect(ok.status).toBe(200);
    expect(await json<{ ticket: string }>(ok)).toHaveProperty('ticket');
    // The emailed code is used up.
    expect((await complete(issued.codes[1]!)).status).toBe(400);
  });

  it('never shows staff accounts or sign-ups without a session', async () => {
    expect((await h.request('GET', '/api/staff')).status).toBe(401);
    const disabled = await h.db.select().from(users).where(eq(users.id, 'ss-to-disable'));
    expect(disabled[0]?.status).toBe('disabled');
  });
});
