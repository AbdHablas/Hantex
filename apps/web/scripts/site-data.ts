/**
 * Prepares one site's build (D-006, D-028): reads the site's configuration and its *published*
 * content, then writes
 *   - src/data/site.json   the data the pages are built from;
 *   - public/theme.css     the site's theme (design tokens, light and dark);
 *   - public/fonts/…       only the font files the theme uses, with their @font-face rules;
 *   - public/robots.txt, sitemap.xml and (live sites) _redirects for old page addresses.
 *
 * With HANTEX_BUILD_DATABASE_URL (the read-only `hantex_build` database user) it reads the
 * database. Without it (local development, CI) it uses the defaults, which contain no facts.
 *
 * Usage: SITE=hantex-ultra [HANTEX_BUILD_DATABASE_URL=…] pnpm --filter @hantex/web data
 */
import { FIRST_SITE } from '@hantex/db/worker';
import {
  DEFAULT_LAYOUT,
  DEFAULT_MENUS,
  DEFAULT_SAVED_SECTIONS,
  checkSite,
  layoutSchema,
  localizedPath,
  mediaIds,
  mediaInfoSchema,
  menusSchema,
  pagePath,
  pageSchema,
  pagesIndexSchema,
  savedSectionsSchema,
  type MediaMap,
  type Page,
} from '@hantex/sections';
import {
  DEFAULT_COMING_SOON,
  DEFAULT_SITE_SETTINGS,
  comingSoonSchema,
  siteKeySchema,
  siteSettingsSchema,
} from '@hantex/shared';
import { adaptiveLogo, logoSchema, type Logo } from '@hantex/shared/logo';
import { sanitizeSvg } from '@hantex/shared/svg';
import {
  FONT_LIBRARY,
  availableWeight,
  brandTheme,
  fontsInUse,
  publishable,
  themeSchema,
  checkThemeFonts,
  fontCatalogue,
  isUploadedFont,
  themeToCss,
  uploadedFontFaces,
  uploadedFontId,
  type FontCatalogue,
  type Script,
  validateTheme,
  type Theme,
} from '@hantex/theme';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { withSlash } from '../src/builder';
import type { BuilderContent, SiteData } from '../src/site-data';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function fail(message: string): never {
  console.error(`Site build data: ${message}`);
  process.exit(1);
}

const key = siteKeySchema.safeParse(process.env['SITE'] ?? FIRST_SITE.key);
if (!key.success) fail('SITE must be a site key such as hantex-ultra');
const siteKey: string = key.data;

async function fromDatabase(url: string): Promise<SiteData> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const site = (
      await client.query<{
        id: string;
        key: string;
        name_ar: string;
        name_en: string;
        locales: string[];
        default_locale: string;
        mode: string;
        template: string;
        archived_at: Date | null;
      }>('select * from sites where key = $1', [siteKey])
    ).rows[0];
    if (!site) fail(`no site with key "${siteKey}"`);
    if (site.archived_at) fail(`site "${siteKey}" is archived`);
    const domains = (
      await client.query<{ hostname: string; is_primary: boolean }>(
        "select hostname, is_primary from site_domains where site_id = $1 and status <> 'removed' order by is_primary desc, hostname",
        [site.id],
      )
    ).rows;
    const latest = async (kind: string) =>
      (
        await client.query<{ data: unknown; version: number }>(
          'select data, version from document_versions where site_id = $1 and kind = $2 order by version desc limit 1',
          [site.id, kind],
        )
      ).rows[0] ?? null;
    // One query at a time: a pg client runs its queries in sequence anyway.
    const comingSoon = await latest('coming-soon');
    const settings = await latest('site-settings');
    const theme = await latest('theme');
    const logo = await latest('logo');
    // An uploaded logo is re-validated like everything else: the schema cleans each file again.
    uploadedLogo = logo ? logoSchema.parse(logo.data) : null;
    const publishedTheme = theme ? themeSchema.parse(theme.data) : brandTheme;
    catalogue = await uploadedFontsFor(client, publishedTheme);
    // The website builder's published documents (D-035): the latest version of each page, of
    // the page index, of the menus and of the header and footer.
    const builderRows = (
      await client.query<{ kind: string; key: string; data: unknown }>(
        "select distinct on (kind, key) kind, key, data from document_versions where site_id = $1 and kind in ('page', 'pages', 'menus', 'layout', 'saved-sections') order by kind, key, version desc",
        [site.id],
      )
    ).rows;
    const builder = site.mode === 'live' ? builderContent(builderRows) : null;
    if (builder) builder.media = await publishedMedia(client, site.id, builder);
    return {
      source: 'database',
      site: {
        id: site.id,
        key: site.key,
        name: { ar: site.name_ar, en: site.name_en },
        locales: site.locales as SiteData['site']['locales'],
        defaultLocale: site.default_locale as SiteData['site']['defaultLocale'],
        mode: site.mode as SiteData['site']['mode'],
        template: site.template as SiteData['site']['template'],
        primaryDomain: domains.find((d) => d.is_primary)?.hostname ?? null,
      },
      turnstileSiteKey: turnstileSiteKey(),
      logo: siteLogo(site.key, uploadedLogo),
      versions: {
        comingSoon: comingSoon?.version ?? null,
        settings: settings?.version ?? null,
        theme: theme?.version ?? null,
      },
      // Published content is re-validated: a build never publishes data the schemas reject.
      comingSoon: comingSoon ? comingSoonSchema.parse(comingSoon.data) : DEFAULT_COMING_SOON,
      settings: settings ? siteSettingsSchema.parse(settings.data) : DEFAULT_SITE_SETTINGS,
      theme: theme ? themeSchema.parse(theme.data) : brandTheme,
      builder,
    };
  } finally {
    await client.end();
  }
}

/** Published pages, re-validated; only pages listed in the index are kept. */
function builderContent(rows: { kind: string; key: string; data: unknown }[]): BuilderContent {
  const row = (kind: string, key = '') => rows.find((r) => r.kind === kind && r.key === key);
  const indexRow = row('pages');
  if (!indexRow) fail('this site is set to live, but no pages have been published');
  const index = pagesIndexSchema.parse(indexRow.data);
  const pages: Record<string, Page> = {};
  for (const id of index.order) {
    const page = row('page', id);
    if (page) pages[id] = pageSchema.parse(page.data);
  }
  return {
    index,
    pages,
    menus: menusSchema.parse(row('menus')?.data ?? DEFAULT_MENUS),
    layout: layoutSchema.parse(row('layout')?.data ?? DEFAULT_LAYOUT),
    saved: savedSectionsSchema.parse(row('saved-sections')?.data ?? DEFAULT_SAVED_SECTIONS),
  };
}

/**
 * The published media library images the pages use (D-044): their sizes, stored widths and
 * descriptions. The files themselves are served by the site Worker from the public bucket.
 */
async function publishedMedia(
  client: pg.Client,
  siteId: string,
  builder: BuilderContent,
): Promise<MediaMap> {
  const ids = [...mediaIds([Object.values(builder.pages), builder.saved])];
  if (ids.length === 0) return {};
  const rows = (
    await client.query<{
      id: string;
      width: number;
      height: number;
      variants: { width: number }[];
      alt: unknown;
    }>(
      'select id, width, height, variants, alt from media_assets where site_id = $1 and id = any($2::uuid[]) and published_at is not null',
      [siteId, ids],
    )
  ).rows;
  const media: MediaMap = {};
  for (const row of rows) {
    media[row.id] = mediaInfoSchema.parse({
      width: row.width,
      height: row.height,
      widths: row.variants.map((v) => v.width),
      alt: row.alt,
    });
  }
  return media;
}

/** Turnstile's public site key; Cloudflare's always-passing test key outside production. */
const turnstileSiteKey = () => process.env['TURNSTILE_SITE_KEY'] ?? '1x00000000000000000000AA';

/** The site's published uploaded logo (D-027), written to public/brand by this build. */
let uploadedLogo: Logo | null = null;

const BRAND_LOCKUP_ASPECT = 375.37 / 120;

/**
 * Logo files. A published uploaded logo wins (D-027); otherwise Hantex Ultra uses its adaptive
 * SVGs from brand/logo, and other sites show their name as text. Uploaded logos have no share
 * picture or phone icon yet: those PNGs are only made for the brand files.
 */
function siteLogo(siteKey: string, uploaded: Logo | null): SiteData['logo'] {
  if (uploaded?.lockup) {
    const result = sanitizeSvg(uploaded.lockup.svg);
    if (!result.ok) fail(`the published logo is not a valid SVG (${result.reason})`);
    const [, , width, height] = result.viewBox;
    return {
      mark: uploaded.mark ? '/brand/mark.svg' : '/brand/lockup.svg',
      lockup: '/brand/lockup.svg',
      aspect: width / height,
      share: null,
      touchIcon: null,
    };
  }
  return siteKey === FIRST_SITE.key
    ? {
        mark: '/brand/mark.svg',
        lockup: '/brand/lockup.svg',
        aspect: BRAND_LOCKUP_ASPECT,
        share: '/brand/share-card.png',
        touchIcon: '/brand/touch-icon.png',
      }
    : null;
}

function defaults(): SiteData {
  const first = siteKey === FIRST_SITE.key;
  return {
    source: 'defaults',
    site: {
      id: null,
      key: siteKey,
      name: first ? FIRST_SITE.name : { ar: siteKey, en: siteKey },
      locales: first ? FIRST_SITE.locales : ['ar', 'en'],
      defaultLocale: first ? FIRST_SITE.defaultLocale : 'ar',
      mode: 'coming-soon',
      template: 'coming-soon',
      primaryDomain: first ? (FIRST_SITE.domains.find((d) => d.isPrimary)?.hostname ?? null) : null,
    },
    turnstileSiteKey: turnstileSiteKey(),
    logo: siteLogo(siteKey, null),
    versions: { comingSoon: null, settings: null, theme: null },
    comingSoon: DEFAULT_COMING_SOON,
    settings: DEFAULT_SITE_SETTINGS,
    theme: brandTheme,
    builder: null,
  };
}

/** The font library with the uploaded fonts the theme uses (D-033); built-in only by default. */
let catalogue: FontCatalogue = fontCatalogue();

async function uploadedFontsFor(client: pg.Client, theme: Theme): Promise<FontCatalogue> {
  const ids = [...fontsInUse(theme.typography).keys()]
    .filter(isUploadedFont)
    .map((ref) => ref.slice('upload-'.length));
  if (ids.length === 0) return fontCatalogue();
  const rows = (
    await client.query<{
      id: string;
      family: string;
      scripts: Script[];
      files: { weight: number }[];
    }>('select id, family, scripts, files from fonts where id = any($1::uuid[])', [ids])
  ).rows;
  return fontCatalogue(
    rows.map((row) => ({
      id: uploadedFontId(row.id),
      name: row.family,
      scripts: row.scripts,
      weights: row.files.map((f) => f.weight),
    })),
  );
}

/**
 * Copies the theme's built-in fonts (only the weights in use) and returns the @font-face rules
 * for them and for the uploaded fonts it uses, which the site Worker serves from R2.
 */
async function fonts(theme: Theme): Promise<string> {
  const out = join(root, 'public', 'fonts');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const faces: string[] = [];
  // Only the fonts, scripts and weights the text styles use (D-032); a weight a font doesn't
  // ship uses its nearest file. Medium (500) is always included for small interface text.
  for (const [ref, scripts] of fontsInUse(theme.typography)) {
    if (isUploadedFont(ref)) continue;
    const id = ref;
    const font = FONT_LIBRARY[id];
    const dir = join(dirname(require.resolve(`${font.source}/package.json`)), 'files');
    for (const [subset, weights] of scripts) {
      for (const weight of new Set([...weights, 500])) {
        const file = `${id}-${subset}-${availableWeight(id, weight)}-normal.woff2`;
        await copyFile(join(dir, file), join(out, file));
        faces.push(
          `@font-face {\n  font-family: "${font.family}";\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url("/fonts/${file}") format("woff2");\n}`,
        );
      }
    }
  }
  const uploaded = uploadedFontFaces(theme, catalogue);
  return [...faces, ...(uploaded ? [uploaded] : [])].join('\n');
}

const url = process.env['HANTEX_BUILD_DATABASE_URL'];
const data = url ? await fromDatabase(url) : defaults();

// A live site is built from its published pages, which must pass the same checks as
// Publish changes (D-037): a visible home page, unique addresses, no broken links.
const builder = data.site.mode === 'live' ? data.builder : null;
if (builder) {
  const issues = checkSite({
    ...builder,
    pages: new Map(Object.entries(builder.pages)),
    locales: data.site.locales,
    // Every image the pages use must be published (copied to the public bucket).
    media: new Set(Object.keys(builder.media ?? {})),
  });
  if (issues.length > 0) {
    fail(`the published pages fail the site checks: ${issues.map((i) => i.code).join(', ')}`);
  }
}
const fontIssues = checkThemeFonts(data.theme.typography, catalogue);
if (fontIssues.length > 0) {
  fail(
    `the published theme uses fonts the library doesn't have: ${fontIssues.map((i) => i.font).join(', ')}`,
  );
}
const themeCheck = validateTheme(data.theme);
if (!publishable(themeCheck)) fail('the published theme fails the contrast or readability checks');

const brandDir = join(root, 'public', 'brand');
await rm(brandDir, { recursive: true, force: true });
// Set while reading the database; TypeScript can't see assignments made inside a function.
const uploaded = uploadedLogo as Logo | null;
if (uploaded?.lockup) {
  // Colours mapped to logo tokens follow the theme's logo colours in light and dark mode.
  await mkdir(brandDir, { recursive: true });
  for (const [name, file] of [
    ['lockup.svg', uploaded.lockup],
    ['mark.svg', uploaded.mark],
  ] as const) {
    if (file) await writeFile(join(brandDir, name), adaptiveLogo(file, data.theme.logo));
  }
} else if (data.logo) {
  await mkdir(brandDir, { recursive: true });
  for (const file of ['mark.svg', 'lockup.svg']) {
    await copyFile(join(root, '..', '..', 'brand', 'logo', file), join(brandDir, file));
  }
  for (const file of ['share-card.png', 'touch-icon.png']) {
    await copyFile(join(root, '..', '..', 'brand', 'raster', file), join(brandDir, file));
  }
}

// Search engines: the pages in every language, with their alternates. Draft previews and the
// form endpoint are never crawled. Without a connected domain there are no absolute addresses,
// so no sitemap is written.
const origin = data.site.primaryDomain ? `https://${data.site.primaryDomain}` : null;
const indexable = data.site.mode !== 'maintenance';
const builderPages = new Map(Object.entries(builder?.pages ?? {}));
/** A builder page's address in one language, ending with a slash (src/builder.ts). */
const builderPath = (id: string, locale: string) =>
  withSlash(
    localizedPath(
      pagePath(id, builderPages, builder?.index.home ?? null),
      locale,
      data.site.defaultLocale,
    ),
  );
/** Each indexable page's address per language: the builder's pages, or the Coming Soon page. */
const sitemapPages: Record<string, string>[] = builder
  ? builder.index.order
      .filter((id) => builder.pages[id]?.visible && !builder.pages[id]?.seo.noindex)
      .map((id) => Object.fromEntries(data.site.locales.map((l) => [l, builderPath(id, l)])))
  : [
      Object.fromEntries(
        data.site.locales.map((l) => [l, l === data.site.defaultLocale ? '/' : `/${l}/`]),
      ),
    ];
await writeFile(
  join(root, 'public', 'robots.txt'),
  [
    'User-agent: *',
    indexable ? 'Disallow: /preview' : 'Disallow: /',
    ...(indexable ? ['Disallow: /unsubscribe'] : []),
    ...(indexable ? ['Disallow: /api/'] : []),
    ...(origin && indexable ? [`Sitemap: ${origin}/sitemap.xml`] : []),
    '',
  ].join('\n'),
);
const sitemapFile = join(root, 'public', 'sitemap.xml');
await rm(sitemapFile, { force: true });
if (origin && indexable) {
  const urls = sitemapPages
    .flatMap((paths) => {
      const alternates = data.site.locales
        .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${origin}${paths[l]}"/>`)
        .join('\n');
      return data.site.locales.map(
        (l) => `  <url>\n    <loc>${origin}${paths[l]}</loc>\n${alternates}\n  </url>`,
      );
    })
    .join('\n');
  await writeFile(
    sitemapFile,
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,
  );
}

// Old addresses of pages whose address changed (D-037) lead to the page's current address.
const redirectsFile = join(root, 'public', '_redirects');
await rm(redirectsFile, { force: true });
if (builder) {
  const current = new Set(
    builder.index.order
      .filter((id) => builder.pages[id]?.visible)
      .flatMap((id) => data.site.locales.map((l) => builderPath(id, l))),
  );
  const lines = builder.index.redirects.flatMap(({ from, to }) => {
    if (!builder.pages[to]?.visible) return [];
    return data.site.locales.flatMap((l) => {
      const oldPath = withSlash(localizedPath(from, l, data.site.defaultLocale));
      const newPath = builderPath(to, l);
      if (oldPath === newPath || current.has(oldPath)) return [];
      // Both spellings of the old address, with and without the final slash.
      return [`${oldPath.slice(0, -1)} ${newPath} 301`, `${oldPath} ${newPath} 301`];
    });
  });
  if (lines.length > 0) await writeFile(redirectsFile, `${[...new Set(lines)].join('\n')}\n`);
}

await mkdir(join(root, 'src', 'data'), { recursive: true });
await writeFile(join(root, 'src', 'data', 'site.json'), `${JSON.stringify(data, null, 2)}\n`);
await writeFile(
  join(root, 'public', 'theme.css'),
  `${await fonts(data.theme)}\n\n${themeToCss(data.theme, catalogue)}`,
);
console.info(`Site build data for "${data.site.key}" written (${data.source}).`);
