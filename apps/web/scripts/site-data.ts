/**
 * Prepares one site's build (D-006, D-028): reads the site's configuration and its *published*
 * content, then writes
 *   - src/data/site.json   the data the pages are built from;
 *   - public/theme.css     the site's theme (design tokens, light and dark);
 *   - public/fonts/…       only the font files the theme uses, with their @font-face rules.
 *
 * With HANTEX_BUILD_DATABASE_URL (the read-only `hantex_build` database user) it reads the
 * database. Without it (local development, CI) it uses the defaults, which contain no facts.
 *
 * Usage: SITE=hantex-ultra [HANTEX_BUILD_DATABASE_URL=…] pnpm --filter @hantex/web data
 */
import { FIRST_SITE } from '@hantex/db/worker';
import {
  DEFAULT_COMING_SOON,
  DEFAULT_SITE_SETTINGS,
  comingSoonSchema,
  siteKeySchema,
  siteSettingsSchema,
} from '@hantex/shared';
import {
  FONT_LIBRARY,
  brandTheme,
  themeSchema,
  themeToCss,
  validateTheme,
  type Theme,
} from '@hantex/theme';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { SiteData } from '../src/site-data';

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
    const [comingSoon, settings, theme] = await Promise.all([
      latest('coming-soon'),
      latest('site-settings'),
      latest('theme'),
    ]);
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
      logo: brandLogo(site.key),
      versions: {
        comingSoon: comingSoon?.version ?? null,
        settings: settings?.version ?? null,
        theme: theme?.version ?? null,
      },
      // Published content is re-validated: a build never publishes data the schemas reject.
      comingSoon: comingSoon ? comingSoonSchema.parse(comingSoon.data) : DEFAULT_COMING_SOON,
      settings: settings ? siteSettingsSchema.parse(settings.data) : DEFAULT_SITE_SETTINGS,
      theme: theme ? themeSchema.parse(theme.data) : brandTheme,
    };
  } finally {
    await client.end();
  }
}

/** Turnstile's public site key; Cloudflare's always-passing test key outside production. */
const turnstileSiteKey = () => process.env['TURNSTILE_SITE_KEY'] ?? '1x00000000000000000000AA';

/**
 * Logo files: Hantex Ultra's adaptive SVGs from brand/logo. Other sites get uploaded, sanitised
 * logos in Phase 3 (D-027); until then their name is shown as text.
 */
const brandLogo = (siteKey: string) =>
  siteKey === FIRST_SITE.key ? { mark: '/brand/mark.svg', lockup: '/brand/lockup.svg' } : null;

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
    logo: brandLogo(siteKey),
    versions: { comingSoon: null, settings: null, theme: null },
    comingSoon: DEFAULT_COMING_SOON,
    settings: DEFAULT_SITE_SETTINGS,
    theme: brandTheme,
  };
}

/** Copies the theme's fonts (only the weights in use) and returns their @font-face rules. */
async function fonts(theme: Theme): Promise<string> {
  const out = join(root, 'public', 'fonts');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const weights = [...new Set([theme.typography.bodyWeight, 500, theme.typography.headingWeight])];
  const faces: string[] = [];
  const uses = [
    { id: theme.typography.latin, subset: 'latin' },
    { id: theme.typography.arabic, subset: 'arabic' },
  ] as const;
  for (const { id, subset } of uses) {
    const font = FONT_LIBRARY[id];
    const dir = join(dirname(require.resolve(`${font.source}/package.json`)), 'files');
    for (const weight of weights) {
      const available = (font.weights as readonly number[]).includes(weight)
        ? weight
        : (font.weights as readonly number[]).reduce((best, w) =>
            Math.abs(w - weight) < Math.abs(best - weight) ? w : best,
          );
      const file = `${id}-${subset}-${available}-normal.woff2`;
      await copyFile(join(dir, file), join(out, file));
      faces.push(
        `@font-face {\n  font-family: "${font.family}";\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url("/fonts/${file}") format("woff2");\n}`,
      );
    }
  }
  return faces.join('\n');
}

const url = process.env['HANTEX_BUILD_DATABASE_URL'];
const data = url ? await fromDatabase(url) : defaults();

if (data.site.mode === 'live') {
  // Going live needs the product templates (Phase 4) and the owner's approval of the launch.
  fail('this site is set to live, but only the Coming Soon and maintenance pages exist so far');
}
const themeCheck = validateTheme(data.theme);
if (themeCheck.errors.length > 0) fail('the published theme fails the contrast checks');

const brandDir = join(root, 'public', 'brand');
await rm(brandDir, { recursive: true, force: true });
if (data.logo) {
  await mkdir(brandDir, { recursive: true });
  for (const file of ['mark.svg', 'lockup.svg']) {
    await copyFile(join(root, '..', '..', 'brand', 'logo', file), join(brandDir, file));
  }
}

await mkdir(join(root, 'src', 'data'), { recursive: true });
await writeFile(join(root, 'src', 'data', 'site.json'), `${JSON.stringify(data, null, 2)}\n`);
await writeFile(
  join(root, 'public', 'theme.css'),
  `${await fonts(data.theme)}\n\n${themeToCss(data.theme)}`,
);
console.info(`Site build data for "${data.site.key}" written (${data.source}).`);
