import AxeBuilder from '@axe-core/playwright';
import { DEFAULT_COMING_SOON, DEFAULT_SITE_SETTINGS } from '@hantex/shared';
import { newSection, starterContent } from '@hantex/sections';
import { brandTheme } from '@hantex/theme';
import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';

/**
 * A second website, live and made entirely of website-builder pages (D-035), built from content
 * published in the test database and served by its own site Worker (e2e/serve.ts).
 */
const LIVE = `http://localhost:${process.env['E2E_LIVE_PORT'] ?? '8790'}`;
const SOON = `http://localhost:${process.env['E2E_PORT'] ?? '8789'}`;

// Cloudflare's analytics beacon is answered locally, so the tests never reach the internet.
test.beforeEach(async ({ context }) => {
  await context.route('https://static.cloudflareinsights.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
});

test('published pages carry the cookieless analytics beacon with the site token (D-042)', async ({
  page,
}) => {
  const cspErrors: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) cspErrors.push(message.text());
  });
  await page.goto(`${LIVE}/en/`);
  const beacon = page.locator('script[src="https://static.cloudflareinsights.com/beacon.min.js"]');
  await expect(beacon).toHaveAttribute(
    'data-cf-beacon',
    JSON.stringify({ token: '0123456789abcdef0123456789abcdef' }),
  );
  expect(cspErrors).toEqual([]);
  // No cookies are set by the site.
  expect(await page.context().cookies()).toEqual([]);
});

test('the home page is built from its sections, in Arabic by default', async ({ page }) => {
  await page.goto(`${LIVE}/`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('عنوان الصفحة الرئيسية');
  await expect(page).toHaveTitle('موقع تجريبي');
  await expect(page.getByRole('region', { name: 'المزايا' })).toContainText('ميزة أولى');
  await page.getByRole('link', { name: 'تواصل', exact: true }).click();
  await expect(page).toHaveURL(`${LIVE}/contact/`);
  await expect(page.getByText('live@example.test').first()).toBeVisible();
});

test('every page has an English version linked from the Arabic one', async ({ page }) => {
  await page.goto(`${LIVE}/who-we-are/`);
  await expect(page.getByText('نص تجريبي عن الموقع.')).toBeVisible();
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(`${LIVE}/en/who-we-are/`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 2, name: 'About us' })).toBeVisible();
  await expect(page.getByText('Test text about the website.')).toBeVisible();
  // The menu marks the page being shown.
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'About us' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('a saved section appears on every page that uses it', async ({ page }) => {
  for (const path of ['/en/', '/en/who-we-are/']) {
    await page.goto(`${LIVE}${path}`);
    await expect(page.getByRole('heading', { name: 'Shared section' }), path).toBeVisible();
  }
});

test('a page’s old address leads to its new one', async ({ request }) => {
  for (const [from, to] of [
    ['/about', '/who-we-are/'],
    ['/about/', '/who-we-are/'],
    ['/en/about', '/en/who-we-are/'],
  ]) {
    const response = await request.get(`${LIVE}${from}`, { maxRedirects: 0 });
    expect(response.status(), from).toBe(301);
    expect(new URL(response.headers()['location'] ?? '', LIVE).pathname, from).toBe(to);
  }
});

test('the websites are separate: the Coming Soon site has none of these pages', async ({
  request,
}) => {
  expect((await request.get(`${SOON}/who-we-are/`)).status()).toBe(404);
  expect(await (await request.get(`${LIVE}/`)).text()).not.toContain('شيء جديد قادم');
});

test('phones get a menu button and only the sections meant for them', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${LIVE}/en/`);
  await expect(page.getByRole('heading', { name: 'Desktop only' })).toBeHidden();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'Contact' })).toBeHidden();
  await page.getByLabel('Menu').click();
  await nav.getByRole('link', { name: 'Contact' }).click();
  await expect(page).toHaveURL(`${LIVE}/en/contact/`);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${LIVE}/en/`);
  await expect(page.getByRole('heading', { name: 'Desktop only' })).toBeVisible();
  await expect(page.getByLabel('Menu')).toBeHidden();
  await expect(nav.getByRole('link', { name: 'Contact' })).toBeVisible();
});

for (const width of [360, 768, 1024, 1440]) {
  test(`fits a ${width}px screen without sideways scrolling or CSP errors`, async ({ page }) => {
    const cspErrors: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) cspErrors.push(message.text());
    });
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/en/', '/who-we-are/', '/en/contact/']) {
      await page.goto(`${LIVE}${path}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${width}px`).toBe(0);
    }
    expect(cspErrors).toEqual([]);
  });
}

test('the sign-up section asks for consent to news, not to a launch', async ({ page }) => {
  await page.goto(`${LIVE}/en/`);
  await expect(page.getByRole('region', { name: 'Stay in touch' })).toContainText(
    'may send me news and updates',
  );
});

test('the sitemap lists every page in every language', async ({ request }) => {
  const sitemap = await (await request.get(`${LIVE}/sitemap.xml`)).text();
  for (const path of [
    '/',
    '/en/',
    '/who-we-are/',
    '/en/who-we-are/',
    '/contact/',
    '/en/contact/',
  ]) {
    expect(sitemap).toContain(`<loc>https://live.example.test${path}</loc>`);
  }
});

for (const [path, scheme] of [
  ['/', 'light'],
  ['/en/', 'dark'],
  ['/en/contact/', 'light'],
] as const) {
  test(`no serious accessibility problems (${path}, ${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto(`${LIVE}${path}`);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
  });
}

/** base64url, as the dashboard encodes preview payloads. */
const base64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

test('a draft page preview renders, and only the dashboard may frame it', async ({ request }) => {
  const builder = starterContent('blank', { ar: 'موقع', en: 'Site' });
  const home = builder.index.home!;
  const cta = newSection('cta');
  cta.settings.heading = { ar: 'مسودة', en: 'Draft section' };
  builder.pages[home]!.sections.push(cta);
  const data = {
    'coming-soon': DEFAULT_COMING_SOON,
    'site-settings': DEFAULT_SITE_SETTINGS,
    theme: brandTheme,
    builder,
    page: { id: home, locale: 'en' },
  };
  const payload = base64Url(JSON.stringify({ site: 'e2e-live', data }));
  const expires = String(Math.floor(Date.now() / 1000) + 600);
  const signature = createHmac('sha256', process.env['E2E_PREVIEW_SECRET'] ?? '')
    .update(`${payload}.${expires}`)
    .digest('hex');

  const response = await request.post(`${LIVE}/preview`, { form: { payload, expires, signature } });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain(
    'frame-ancestors https://admin.example.test',
  );
  const html = await response.text();
  expect(html).toContain('Draft section');
  expect(html).toContain('noindex');
  // Previews are never counted.
  expect(html).not.toContain('cloudflareinsights');
  // Signed for this site only: the other site refuses it.
  expect(
    (await request.post(`${SOON}/preview`, { form: { payload, expires, signature } })).status(),
  ).toBe(403);
});

test('media library images are drawn from the site’s own /media/ address', async ({
  page,
  request,
}) => {
  await page.goto(`${LIVE}/en/who-we-are/`);
  const figure = page.getByRole('figure').filter({ hasText: 'Picture caption' });
  const img = figure.getByRole('img', { name: 'A test picture' });
  await expect(img).toHaveAttribute('width', '1600');
  await expect(img).toHaveAttribute('height', '900');
  await expect(img).toHaveAttribute('srcset', /\/media\/[0-9a-f-]{36}\/480\.webp 480w/);
  const src = (await img.getAttribute('src')) ?? '';
  const response = await request.get(`${LIVE}${src}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/webp');
  expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  // Another site's address, or an image that isn't published, is not found.
  expect((await request.get(`${LIVE}${src.replace(/[0-9a-f]{4}\//, '0000/')}`)).status()).toBe(404);

  // Loaded lazily: only once it's scrolled into view.
  await img.scrollIntoViewIfNeeded();
  // decode() fails for a broken image. (naturalWidth isn't used: with srcset it is scaled, and
  // the test file is 1×1 pixel.)
  expect(
    await img.evaluate((el: HTMLImageElement) => el.decode().then(() => el.currentSrc)),
  ).toMatch(/\/media\/[0-9a-f-]{36}\/\d+\.webp$/);

  // Its sharing picture: the stored width closest above 1200 px, at the site's own domain.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /^https:\/\/live\.example\.test\/media\/[0-9a-f-]{36}\/1600\.webp$/,
  );
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    'content',
    'A test picture',
  );
});

test('an uploaded logo is served cleaned and follows light and dark mode (D-027)', async ({
  page,
  request,
}) => {
  await page.goto(`${LIVE}/en/`);
  const logo = page.locator('header .logo img');
  await expect(logo).toHaveAttribute('src', '/brand/lockup.svg');
  await expect(logo).toHaveAttribute('width', '224');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/lockup.svg');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(0);
  expect(
    await logo.evaluate((el: HTMLImageElement) => el.decode().then(() => el.naturalWidth)),
  ).toBeGreaterThan(0);

  const file = await request.get(`${LIVE}/brand/lockup.svg`);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toContain('image/svg+xml');
  const svg = await file.text();
  expect(svg).not.toContain('<script');
  expect(svg).toContain(`svg{--_hx-neutral:${brandTheme.logo.light.neutral}}`);
  expect(svg).toContain(
    `@media (prefers-color-scheme:dark){svg{--_hx-neutral:${brandTheme.logo.dark.neutral}}}`,
  );
  expect(svg).toMatch(/<rect[^>]* class="hx-f-neutral"/);
  expect(svg).toMatch(/<circle[^>]*fill="#ff6600"/);
});

test('an uploaded font is served by the site and used for headings (D-033)', async ({
  page,
  request,
}) => {
  const id = '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a';
  const file = await request.get(`${LIVE}/fonts/library/${id}/700.woff2`);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('font/woff2');
  expect(file.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  expect((await request.get(`${LIVE}/fonts/library/${id}/300.woff2`)).status()).toBe(404);

  await page.goto(`${LIVE}/en/`);
  const family = `upload-${id}`;
  expect(
    await page.evaluate(async (name) => {
      await document.fonts.load(`700 32px "${name}"`, 'Heading');
      return document.fonts.check(`700 32px "${name}"`, 'Heading');
    }, family),
  ).toBe(true);
  expect(
    await page
      .locator('h1')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain(family);
});

test('a video loads nothing from YouTube until the visitor presses play', async ({ page }) => {
  const youtube: string[] = [];
  const cspErrors: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) cspErrors.push(message.text());
  });
  page.on('request', (r) => {
    if (/youtube/.test(new URL(r.url()).hostname)) youtube.push(r.url());
  });
  // The player itself can't load in the test; only what the page asks for matters.
  await page.route(/youtube-nocookie\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>player</title>' }),
  );
  await page.goto(`${LIVE}/en/`);
  const play = page.getByRole('link', { name: 'Play video: A test video' });
  await expect(play).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await expect(page.getByText('Plays from YouTube when you press it.')).toBeVisible();
  await play.scrollIntoViewIfNeeded();
  expect(youtube).toEqual([]);

  await play.click();
  const frame = page.locator('iframe[title="A test video"]');
  await expect(frame).toHaveAttribute(
    'src',
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1/,
  );
  await expect(play).toHaveCount(0);
  await expect.poll(() => youtube.length).toBeGreaterThan(0);
  // The site's Content-Security-Policy lets this player, and only the video players, be framed.
  expect(cspErrors).toEqual([]);
});
