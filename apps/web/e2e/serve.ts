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
  fonts,
  mediaAssets,
  runMigrations,
  siteFiles,
  sites,
  syncStandardRoles,
} from '@hantex/db';
import {
  DEFAULT_CATALOGUE,
  newPage,
  newProduct,
  newSection,
  richDocFromText,
  savedReference,
  starterContent,
  type Bilingual,
  type Catalogue,
  type Page,
  type Product,
} from '@hantex/sections';
import { DEFAULT_COMING_SOON, DEFAULT_SITE_SETTINGS } from '@hantex/shared';
import { eq } from 'drizzle-orm';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { newLogoFile } from '@hantex/shared/logo';
import { sanitizeSvg } from '@hantex/shared/svg';
import { brandTheme, uploadedFontId } from '@hantex/theme';
import pg from 'pg';
import { makeBoxGlb } from '@hantex/studio-runner/test/fixture';

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
// A catalogue (D-048) and a page made of product sections. Names and values are test data.
const T = (en: string, ar: string) => ({ en, ar });
const catalogue: Catalogue = {
  ...DEFAULT_CATALOGUE,
  categories: [
    {
      id: 'catswitch',
      name: T('Test switches', 'مفاتيح تجريبية'),
      slug: 'switches',
      parentId: null,
      main: true,
      description: T('A test category.', 'فئة تجريبية.'),
      image: { mediaId: IMAGE_ID },
      attributeIds: ['attgangs', 'attcurrent', 'attusb'],
    },
    {
      id: 'catsocket',
      name: T('Test sockets', 'مقابس تجريبية'),
      slug: 'sockets',
      parentId: null,
      main: true,
      description: T('', ''),
      image: null,
      attributeIds: ['attgangs'],
    },
  ],
  groups: [{ id: 'grpelec', name: T('Electrical', 'كهربائية') }],
  attributes: [
    {
      id: 'attgangs',
      name: T('Gangs', 'عدد الأزرار'),
      groupId: 'grpelec',
      type: 'number',
      unit: '',
      choices: [],
      filterable: true,
    },
    {
      id: 'attcurrent',
      name: T('Rated current', 'التيار المقنن'),
      groupId: 'grpelec',
      type: 'number',
      unit: 'A',
      choices: [],
      filterable: false,
    },
    {
      id: 'attusb',
      name: T('USB outlet', 'منفذ USB'),
      groupId: null,
      type: 'yes-no',
      unit: '',
      choices: [],
      filterable: false,
    },
  ],
  finishes: [
    {
      id: 'fnwhite',
      name: T('Test white', 'أبيض تجريبي'),
      swatch: '#f4f4f2',
      material: 'plastic',
      image: null,
    },
    {
      id: 'fnblack',
      name: T('Test black', 'أسود تجريبي'),
      swatch: '#1b1e24',
      material: 'plastic',
      image: null,
    },
  ],
  series: [
    {
      id: 'seralpha',
      name: T('Test series', 'سلسلة تجريبية'),
      slug: 'alpha',
      description: T('', ''),
      image: null,
      finishIds: ['fnwhite'],
      documents: [],
    },
  ],
  products: ['prdone', 'prdtwo', 'prdhidden'],
  // The product's earlier address, as Publish changes records it (D-050).
  redirects: [{ kind: 'product', from: 'old-one', to: 'prdone' }],
};
// A published PDF (D-045) offered as a datasheet and as a checked certificate; a second, unchecked
// certificate must never appear on the site.
const FILE_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const PDF = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n';
await db.insert(siteFiles).values({
  id: FILE_ID,
  siteId: liveId,
  name: 'datasheet.pdf',
  bytes: PDF.length,
  publishedAt: new Date(),
});
const product = (name: Bilingual, slug: string, extra: Partial<Product>): Product => ({
  ...newProduct(name, slug, 'catswitch'),
  visible: true,
  ...extra,
});
const products: Record<string, Product> = {
  prdone: product(T('Test one-gang switch', 'مفتاح تجريبي واحد'), 'one-gang', {
    seriesId: 'seralpha',
    summary: T('A test summary.', 'ملخص تجريبي.'),
    images: [{ mediaId: IMAGE_ID }],
    values: { attgangs: { number: 1 }, attcurrent: { number: 10 }, attusb: { yes: false } },
    variants: [
      { id: 'varwhite', sku: 'TST-1W', finishId: 'fnwhite', name: T('', ''), images: [] },
      { id: 'varblack', sku: 'TST-1B', finishId: 'fnblack', name: T('', ''), images: [] },
    ],
    description: T(
      'First test paragraph.\n\nSecond test paragraph.',
      'الفقرة التجريبية الأولى.\n\nالفقرة التجريبية الثانية.',
    ),
    // Features (D-059): beside the 3D model, each turns it to a view.
    features: [
      {
        id: 'featfront',
        title: T('Test front feature', 'ميزة الأمام التجريبية'),
        text: T('Test text about the front.', 'نص تجريبي عن الأمام.'),
        view: 'front',
      },
      {
        id: 'featright',
        title: T('Test right-side feature', 'ميزة الجانب الأيمن التجريبية'),
        text: T('', ''),
        view: 'right',
      },
      {
        id: 'feattop',
        title: T('Test top feature', 'ميزة الأعلى التجريبية'),
        text: T('Test text about the top.', 'نص تجريبي عن الأعلى.'),
        view: 'top',
      },
      {
        id: 'featback',
        title: T('Test back feature', 'ميزة الخلف التجريبية'),
        text: T('', ''),
        view: 'back',
      },
      {
        id: 'featleft',
        title: T('Test left-side feature', 'ميزة الجانب الأيسر التجريبية'),
        text: T('', ''),
        view: 'left',
      },
    ],
    documents: [
      {
        id: 'docdata01',
        fileId: FILE_ID,
        type: 'datasheet',
        title: T('Test datasheet', 'نشرة تجريبية'),
        certificate: null,
        verified: null,
      },
      {
        id: 'doccert01',
        fileId: FILE_ID,
        type: 'certificate',
        title: T('Checked certificate', 'شهادة مدققة'),
        certificate: { name: 'Test mark', number: 'TM-001', issuer: 'Test lab', validUntil: null },
        verified: { by: 'test-owner', at: '2026-11-01T00:00:00.000Z' },
      },
      {
        id: 'doccert02',
        fileId: FILE_ID,
        type: 'certificate',
        title: T('Unchecked certificate', 'شهادة غير مدققة'),
        certificate: {
          name: 'Unchecked mark',
          number: 'UM-1',
          issuer: 'Other lab',
          validUntil: null,
        },
        verified: null,
      },
    ],
  }),
  prdtwo: product(T('Test two-gang switch', 'مفتاح تجريبي مزدوج'), 'two-gang', {
    values: { attgangs: { number: 2 }, attusb: { yes: true } },
    // No 3D model: its feature shows as a plain list.
    features: [
      {
        id: 'featplain',
        title: T('Test plain feature', 'ميزة تجريبية بسيطة'),
        text: T('Test plain text.', 'نص تجريبي بسيط.'),
        view: 'angle',
      },
    ],
  }),
  prdhidden: product(T('Hidden test product', 'منتج مخفي'), 'hidden', { visible: false }),
};
const grid = newSection('products');
grid.settings.title = T('Switch range', 'مجموعة المفاتيح');
grid.settings.source = 'category';
grid.settings.categoryId = 'catswitch';
const carousel = newSection('products');
carousel.settings.title = T('Featured', 'مختارات');
carousel.settings.source = 'picked';
carousel.settings.productIds = ['prdtwo', 'prdone'];
carousel.settings.layout = 'carousel';
const collections = newSection('collections');
collections.settings.title = T('Categories', 'الفئات');
const specs = newSection('specs');
specs.settings.title = T('Specifications', 'المواصفات');
specs.settings.productId = 'prdone';
const compare = newSection('compare');
compare.settings.title = T('Compare', 'مقارنة');
compare.settings.productIds = ['prdone', 'prdtwo'];
const enquirySection = newSection('enquiry');
enquirySection.settings.title = T('Talk to us', 'تحدث إلينا');
enquirySection.settings.kind = 'quote';
const range: Page = {
  ...newPage(T('Range', 'المنتجات'), 'range'),
  sections: [grid, carousel, collections, specs, compare, enquirySection],
};
const RANGE_ID = 'pgrange01';
content.pages[RANGE_ID] = range;
content.index.order.push(RANGE_ID);
// A header menu item leading to a category page (D-048).
content.menus.header.push({
  id: 'mncat001',
  label: T('Switch catalogue', 'كتالوج المفاتيح'),
  link: { type: 'category', categoryId: 'catswitch' },
  visible: true,
  children: [],
});

// An uploaded logo (D-027): the dark square follows the theme's logo colours, the orange dot
// stays fixed. No mark, so the lockup is also the browser-tab icon.
const cleanedLogo = sanitizeSvg(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40"><title>Test website</title><rect width="40" height="40" rx="8" fill="#1b1e24"/><circle cx="20" cy="20" r="6" fill="#ff6600"/><script>alert(1)</script></svg>',
);
if (!cleanedLogo.ok) throw new Error('test logo refused');
const lockup = newLogoFile(cleanedLogo.svg, cleanedLogo.colours);
lockup.colours = lockup.colours.map((c) =>
  c.colour === '#1b1e24' ? { ...c, use: 'neutral' as const } : c,
);
// An uploaded font (D-033) for the headings' Latin text: Cairo's Latin files from the built-in
// library, stored as the dashboard would store them.
const FONT_ID = '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a';
// Approved 3D models on the one-gang switch's page, one per finish (D-057, D-058): the white one
// made by an artist and checked true to scale, the black one measured from photos, not checked.
const MODEL_ID = '5e4d3c2b-1a09-4f8e-9d7c-6b5a4f3e2d1c';
const BLACK_MODEL_ID = '6f5e4d3c-2b1a-4c9d-8e7f-0a1b2c3d4e5f';
const FONT_WEIGHTS = [400, 700];
await db.insert(fonts).values({
  id: FONT_ID,
  family: 'Cairo',
  scripts: ['latin'],
  files: FONT_WEIGHTS.map((weight) => ({ weight, bytes: 1 })),
  licence: { name: 'SIL Open Font License 1.1', url: null },
  licenceConfirmedAt: new Date(),
});
const liveTheme = structuredClone(brandTheme);
liveTheme.typography.fonts.heading.latin = uploadedFontId(FONT_ID);
await db.insert(documentVersions).values([
  { siteId: liveId, kind: 'logo', version: 1, data: { lockup, mark: null } },
  { siteId: liveId, kind: 'theme', version: 1, data: liveTheme },
  { siteId: liveId, kind: 'pages', version: 1, data: content.index },
  { siteId: liveId, kind: 'menus', version: 1, data: content.menus },
  { siteId: liveId, kind: 'layout', version: 1, data: content.layout },
  { siteId: liveId, kind: 'saved-sections', version: 1, data: saved },
  { siteId: liveId, kind: 'catalogue', version: 1, data: catalogue },
  {
    siteId: liveId,
    kind: 'models',
    version: 1,
    data: {
      products: {
        prdone: [
          { id: MODEL_ID, label: 'artist-modelled', trueScale: true, finishId: 'fnwhite' },
          { id: BLACK_MODEL_ID, label: 'measured', trueScale: false, finishId: 'fnblack' },
        ],
      },
    },
  },
  ...Object.entries(products).map(([id, data]) => ({
    siteId: liveId,
    kind: 'product' as const,
    key: id,
    version: 1,
    data,
  })),
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
const cairo = join(
  dirname(createRequire(import.meta.url).resolve('@fontsource/cairo/package.json')),
  'files',
);
const pdf = join(dirname(webp), 'datasheet.pdf');
await writeFile(pdf, PDF);
execFileSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'r2',
    'object',
    'put',
    `hantex-media-public/sites/e2e-live/files/${FILE_ID}.pdf`,
    '--file',
    pdf,
    '--content-type',
    'application/pdf',
    '--local',
    '--persist-to',
    '.e2e/live/state',
    '--config',
    '.e2e/live/server/wrangler.json',
  ],
  { stdio: 'inherit', env: { ...env, WRANGLER_SEND_METRICS: 'false' } },
);
for (const weight of FONT_WEIGHTS) {
  execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'r2',
      'object',
      'put',
      `hantex-media-public/fonts/${FONT_ID}/${weight}.woff2`,
      '--file',
      join(cairo, `cairo-latin-${weight}-normal.woff2`),
      '--content-type',
      'font/woff2',
      '--local',
      '--persist-to',
      '.e2e/live/state',
      '--config',
      '.e2e/live/server/wrangler.json',
    ],
    { stdio: 'inherit', env: { ...env, WRANGLER_SEND_METRICS: 'false' } },
  );
}
// The models' published files: a real GLB (an 86 × 86 × 12 mm plate) and its posters.
const glb = join(dirname(webp), 'model.glb');
await writeFile(glb, await makeBoxGlb({ sizeMm: { width: 86, height: 86, depth: 12 } }));
for (const [id, name, source, type] of [MODEL_ID, BLACK_MODEL_ID].flatMap(
  (id) =>
    [
      [id, 'desktop.glb', glb, 'model/gltf-binary'],
      [id, 'mobile.glb', glb, 'model/gltf-binary'],
      [id, 'poster-front.webp', webp, 'image/webp'],
      [id, 'poster-three-quarter.webp', webp, 'image/webp'],
    ] as const,
)) {
  execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'r2',
      'object',
      'put',
      `hantex-media-public/sites/e2e-live/models/${id}/${name}`,
      '--file',
      source,
      '--content-type',
      type,
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
