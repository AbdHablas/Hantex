/**
 * Web server for the browser tests (Playwright starts it before anything else): creates a
 * throwaway database, publishes test content, builds two sites from it exactly as the publish
 * workflow will (read-only build user), then serves each built Worker with `wrangler dev`:
 *   - Hantex Ultra in Coming Soon mode on E2E_PORT;
 *   - a second, live website made with the website builder on E2E_LIVE_PORT (D-035).
 */
import {
  APP_DB_ROLES,
  FIRST_SITE,
  applyDatabaseRoles,
  createPoolDb,
  documentVersions,
  ensureSite,
  mediaAssets,
  runMigrations,
  sites,
  syncStandardRoles,
} from '@hantex/db';
import { newSection, richDocFromText, savedReference, starterContent } from '@hantex/sections';
import { DEFAULT_COMING_SOON, DEFAULT_SITE_SETTINGS } from '@hantex/shared';
import { eq } from 'drizzle-orm';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const env = process.env;
const base = env['HANTEX_TEST_DATABASE_URL'] ?? 'postgres://postgres@127.0.0.1:54329/postgres';
const name = env['E2E_DATABASE'] ?? 'hantex_web_e2e';
const url = (user?: string, password?: string) => {
  const u = new URL(base);
  u.pathname = `/${name}`;
  if (user) {
    u.username = user;
    u.password = password ?? '';
  }
  return u.toString();
};

const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(name)} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(name)}`);
await admin.end();

const { db, close } = createPoolDb(url(), 1);
await runMigrations(db);
await syncStandardRoles(db);
const siteId = await ensureSite(db, FIRST_SITE);
const passwords = Object.fromEntries(
  APP_DB_ROLES.map((r) => [r, randomBytes(16).toString('hex')]),
) as Record<(typeof APP_DB_ROLES)[number], string>;
passwords.hantex_build = env['E2E_BUILD_PASSWORD'] ?? passwords.hantex_build;
passwords.hantex_public_app = env['E2E_PUBLIC_PASSWORD'] ?? passwords.hantex_public_app;
await applyDatabaseRoles(url(), passwords);

// Published content (what the dashboard's Publish button writes).
await db.insert(documentVersions).values([
  {
    siteId,
    kind: 'coming-soon',
    version: 1,
    data: {
      ...DEFAULT_COMING_SOON,
      headline: { ar: 'شيء جديد قادم', en: 'Something new is coming' },
      tagline: { ar: 'مفاتيح ومقابس', en: 'Switches and sockets' },
      launchAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      showCountdown: true,
      milestones: [{ date: '2026-10-01', title: { ar: 'التصميم', en: 'Design' }, done: true }],
      highlights: [{ title: { ar: 'ميزة', en: 'Feature' }, text: { ar: 'نص', en: 'Text' } }],
      categories: [
        { icon: 'switch', title: { ar: 'مفاتيح', en: 'Switches' }, text: { ar: '', en: '' } },
        { icon: 'socket', title: { ar: 'مقابس', en: 'Sockets' }, text: { ar: '', en: '' } },
      ],
      faq: [
        {
          question: { ar: 'سؤال تجريبي؟', en: 'A test question?' },
          answer: { ar: 'جواب تجريبي.', en: 'A test answer.' },
        },
      ],
    },
  },
  {
    siteId,
    kind: 'site-settings',
    version: 1,
    data: {
      ...DEFAULT_SITE_SETTINGS,
      contact: { ...DEFAULT_SITE_SETTINGS.contact, email: 'hello@example.test' },
      social: { ...DEFAULT_SITE_SETTINGS.social, instagram: 'https://instagram.com/example' },
      privacy: {
        note: { ar: 'ملاحظة خصوصية للاختبار.', en: 'A test privacy note.' },
        url: 'https://www.hantexultra.com/privacy',
      },
    },
  },
]);

// The second website: live, made of builder pages (test text only, no facts).
const liveId = await ensureSite(db, {
  key: 'e2e-live',
  name: { ar: 'موقع تجريبي', en: 'Test website' },
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  template: 'product-showcase',
  domains: [{ hostname: 'live.example.test', isPrimary: true }],
});
await db.update(sites).set({ mode: 'live' }).where(eq(sites.id, liveId));
const content = starterContent('business', { ar: 'موقع تجريبي', en: 'Test website' });
const [homeId, aboutId, contactId] = content.index.order as [string, string, string];
const home = content.pages[homeId]!;
const hero = home.sections[0]!;
if (hero.type === 'hero') {
  hero.settings.heading = { ar: 'عنوان الصفحة الرئيسية', en: 'Home page heading' };
  hero.settings.primary = {
    label: { ar: 'تواصل', en: 'Get in touch' },
    link: { type: 'page', pageId: contactId },
  };
}
const features = newSection('features');
features.settings.title = { ar: 'المزايا', en: 'Features' };
features.settings.items[0]!.title = { ar: 'ميزة أولى', en: 'First feature' };
const desktopOnly = newSection('cta');
desktopOnly.settings.heading = { ar: 'للشاشات الكبيرة فقط', en: 'Desktop only' };
desktopOnly.visibility = { mobile: false, tablet: false, desktop: true };
const faq = newSection('faq');
faq.settings.title = { ar: 'أسئلة', en: 'Questions' };
faq.settings.items[0]!.question = { ar: 'سؤال؟', en: 'A question?' };
faq.settings.items[0]!.answer = { ar: 'جواب.', en: 'An answer.' };
const video = newSection('video');
video.settings.video = { provider: 'youtube', id: 'dQw4w9WgXcQ' };
video.settings.title = { ar: 'فيديو تجريبي', en: 'A test video' };
const signup = newSection('newsletter');
signup.settings.title = { ar: 'اشترك', en: 'Stay in touch' };
home.sections.push(features, desktopOnly, faq, video, signup);
const about = content.pages[aboutId]!;
const text = about.sections[0]!;
if (text.type === 'richText') {
  text.settings.title = { ar: 'من نحن', en: 'About us' };
  text.settings.body = {
    ar: richDocFromText('نص تجريبي عن الموقع.'),
    en: richDocFromText('Test text about the website.'),
  };
}
// A saved section (D-038), reused on two pages.
const shared = newSection('cta');
shared.settings.heading = { ar: 'قسم مشترك', en: 'Shared section' };
const saved = { items: [{ id: 'shared01', name: { ar: 'مشترك', en: 'Shared' }, section: shared }] };
home.sections.push(savedReference('shared01', 'ref00001'));
about.sections.push(savedReference('shared01', 'ref00002'));
// A published media library image (D-044) on the About page, also its sharing picture. The
// stored file is a 1×1 WebP: the test checks it is served, not what it shows.
const IMAGE_ID = '6f1d2c3b-4a5e-4f60-8a71-9b2c3d4e5f60';
const IMAGE_WIDTHS = [480, 960, 1600];
await db.insert(mediaAssets).values({
  id: IMAGE_ID,
  siteId: liveId,
  name: 'test-picture.png',
  alt: { ar: 'صورة تجريبية', en: 'A test picture' },
  width: 1600,
  height: 900,
  variants: IMAGE_WIDTHS.map((w) => ({ width: w, height: Math.round((w * 9) / 16), bytes: 26 })),
  bytes: 78,
  publishedAt: new Date(),
});
const picture = newSection('image');
picture.settings.image = { mediaId: IMAGE_ID };
picture.settings.caption = { ar: 'تعليق الصورة', en: 'Picture caption' };
about.sections.push(picture);
about.seo.image = { mediaId: IMAGE_ID };
// /about was this page's earlier address (Publish changes keeps it as a redirect).
about.slug = 'who-we-are';
content.index.redirects = [{ from: '/about', to: aboutId }];
await db.insert(documentVersions).values([
  { siteId: liveId, kind: 'pages', version: 1, data: content.index },
  { siteId: liveId, kind: 'menus', version: 1, data: content.menus },
  { siteId: liveId, kind: 'layout', version: 1, data: content.layout },
  { siteId: liveId, kind: 'saved-sections', version: 1, data: saved },
  ...Object.entries(content.pages).map(([id, page]) => ({
    siteId: liveId,
    kind: 'page' as const,
    key: id,
    version: 1,
    data: page,
  })),
  {
    siteId: liveId,
    kind: 'site-settings',
    version: 1,
    data: {
      ...DEFAULT_SITE_SETTINGS,
      contact: { ...DEFAULT_SITE_SETTINGS.contact, email: 'live@example.test' },
      analytics: { cloudflareToken: '0123456789abcdef0123456789abcdef' },
    },
  },
]);
await close();

/** Builds one site and keeps its output, since every build writes to dist/. */
async function build(site: string, out: string) {
  execFileSync('pnpm', ['build'], {
    stdio: 'inherit',
    env: {
      ...env,
      SITE: site,
      HANTEX_BUILD_DATABASE_URL: url('hantex_build', passwords.hantex_build),
      // Cloudflare's published Turnstile test key that always fails (see the spec).
      TURNSTILE_SITE_KEY: '2x00000000000000000000AB',
    },
  });
  await rm(out, { recursive: true, force: true });
  await cp('dist', out, { recursive: true });
}
await build('e2e-live', '.e2e/live');
// The image's published copies, in the live site's local public bucket.
const webp = join(await mkdtemp(join(tmpdir(), 'hantex-e2e-')), 'pixel.webp');
await writeFile(
  webp,
  Uint8Array.from(atob('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='), (ch) =>
    ch.charCodeAt(0),
  ),
);
for (const width of IMAGE_WIDTHS) {
  execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'r2',
      'object',
      'put',
      `hantex-media-public/sites/e2e-live/${IMAGE_ID}/${width}.webp`,
      '--file',
      webp,
      '--content-type',
      'image/webp',
      '--local',
      '--persist-to',
      '.e2e/live/state',
      '--config',
      '.e2e/live/server/wrangler.json',
    ],
    { stdio: 'inherit', env: { ...env, WRANGLER_SEND_METRICS: 'false' } },
  );
}
await build(FIRST_SITE.key, '.e2e/soon');

function serve(dir: string, port: string, inspector: string) {
  return spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--config',
      `${dir}/server/wrangler.json`,
      '--port',
      port,
      '--ip',
      '127.0.0.1',
      '--inspector-port',
      inspector,
      '--persist-to',
      `${dir}/state`,
      '--var',
      'TURNSTILE_SECRET_KEY:2x0000000000000000000000000000000AA',
      '--var',
      `PREVIEW_SIGNING_SECRET:${env['E2E_PREVIEW_SECRET'] ?? ''}`,
      '--var',
      `UNSUBSCRIBE_SECRET:${env['E2E_UNSUBSCRIBE_SECRET'] ?? ''}`,
      '--var',
      'DASHBOARD_ORIGIN:https://admin.example.test',
    ],
    {
      stdio: 'inherit',
      env: {
        ...env,
        WRANGLER_SEND_METRICS: 'false',
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: url(
          'hantex_public_app',
          passwords.hantex_public_app,
        ),
      },
    },
  );
}
const servers = [
  serve('.e2e/soon', env['E2E_PORT'] ?? '8789', '9330'),
  serve('.e2e/live', env['E2E_LIVE_PORT'] ?? '8790', '9331'),
];
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => servers.forEach((s) => s.kill(signal)));
}
for (const server of servers) server.on('exit', (code) => process.exit(code ?? 0));
