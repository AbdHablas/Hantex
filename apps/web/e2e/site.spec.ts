import { DEFAULT_COMING_SOON, DEFAULT_SITE_SETTINGS } from '@hantex/shared';
import { brandTheme } from '@hantex/theme';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';
import pg from 'pg';

/** base64url, as the dashboard encodes preview payloads. */
const base64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * The Hantex Ultra Coming Soon site, built from content published in a throwaway database and
 * served by the real site Worker (e2e/serve.ts).
 */

test('the Arabic page is the default, right-to-left, and shows only published content', async ({
  page,
}) => {
  const cspErrors: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) cspErrors.push(message.text());
  });
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('شيء جديد قادم');
  await expect(page.locator('.hero').getByText('مفاتيح ومقابس')).toBeVisible();
  await expect(page.getByText('التصميم')).toBeVisible();
  await expect(page.getByRole('link', { name: 'hello@example.test' })).toBeVisible();
  // The privacy note the dashboard published sits under the sign-up form.
  await expect(page.getByText('ملاحظة خصوصية للاختبار.')).toBeVisible();
  // The countdown runs (it starts as dashes).
  await expect(page.locator('[data-unit="days"]')).not.toHaveText('–');
  // Search engines get the canonical address and both languages.
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://www.hantexultra.com/',
  );
  await expect(page.locator('link[hreflang="en"]')).toHaveAttribute(
    'href',
    'https://www.hantexultra.com/en/',
  );
  // The theme's fonts and colours load.
  const background = await page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundColor,
  );
  expect(background).not.toBe('rgba(0, 0, 0, 0)');
  expect(cspErrors).toEqual([]);
});

test('the English page is left-to-right and linked from the Arabic one', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/?$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something new is coming');
});

test('visitors can switch between light and dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/en/');
  await page.getByRole('button', { name: 'Switch between light and dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('a sign-up reaches the server and is refused without a passed security check', async ({
  page,
}) => {
  // A stand-in for Cloudflare's Turnstile widget that hands back a token. The site Worker runs
  // with Turnstile's always-failing test secret, so the server must refuse the sign-up.
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'window.turnstile = { render: (el, o) => { setTimeout(() => o.callback("test-token")); return "w"; }, reset: () => {} };',
    }),
  );
  await page.goto('/en/');
  await page.getByLabel('Your email address').fill('visitor@example.test');
  await page.getByLabel(/I agree that/).check();
  await page.waitForFunction(() => 'turnstile' in window);
  await page.getByRole('button', { name: 'Notify me' }).click();
  await expect(page.getByRole('status')).toHaveText('The security check failed. Please try again.');

  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const rows = await client.query('select 1 from subscribers');
  await client.end();
  expect(rows.rowCount).toBe(0);
});

test('product categories and FAQ come from the published content', async ({ page }) => {
  await page.goto('/en/');
  const categories = page.getByRole('region', { name: 'What we’re working on' });
  await expect(categories.getByRole('heading', { level: 3 })).toHaveText(['Switches', 'Sockets']);
  const faq = page.getByRole('region', { name: 'Frequently asked questions' });
  await expect(faq.getByText('A test answer.')).toBeHidden();
  await faq.getByText('A test question?').click();
  await expect(faq.getByText('A test answer.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
    'href',
    'https://instagram.com/example',
  );
});

test('the sign-up switches between email and WhatsApp hints', async ({ page }) => {
  await page.goto('/en/');
  await page.getByText('WhatsApp', { exact: true }).click();
  const field = page.getByLabel('WhatsApp number with country code');
  await expect(field).toHaveAttribute('inputmode', 'tel');
  await page.getByText('Email', { exact: true }).click();
  await expect(page.getByLabel('Your email address')).toHaveAttribute('inputmode', 'email');
});

for (const [path, scheme] of [
  ['/', 'light'],
  ['/en/', 'dark'],
] as const) {
  test(`fits a 360px phone without sideways scrolling or CSP errors (${path}, ${scheme})`, async ({
    page,
  }) => {
    const cspErrors: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) cspErrors.push(message.text());
    });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(path);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    expect(cspErrors).toEqual([]);
  });
}

test('the sign-up endpoint refuses other origins', async ({ request }) => {
  const response = await request.post('/api/signup', {
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    data: { contact: 'a@example.test', consent: true, locale: 'en', turnstileToken: 't' },
  });
  expect(response.status()).toBe(403);
});

test('a signed draft preview renders, is never cached or indexed, and a tampered one is refused', async ({
  request,
}) => {
  const data = {
    'coming-soon': { ...DEFAULT_COMING_SOON, headline: { ar: 'مسودة', en: 'Draft headline' } },
    'site-settings': DEFAULT_SITE_SETTINGS,
    theme: brandTheme,
  };
  const payload = base64Url(JSON.stringify({ site: 'hantex-ultra', data }));
  const expires = String(Math.floor(Date.now() / 1000) + 600);
  const signature = createHmac('sha256', process.env['E2E_PREVIEW_SECRET'] ?? '')
    .update(`${payload}.${expires}`)
    .digest('hex');

  const ok = await request.post('/preview?lang=en', { form: { payload, expires, signature } });
  expect(ok.status()).toBe(200);
  expect(ok.headers()['cache-control']).toBe('no-store');
  expect(ok.headers()['x-robots-tag']).toContain('noindex');
  const html = await ok.text();
  expect(html).toContain('Draft headline');
  expect(html).toContain('Draft preview');

  const tampered = await request.post('/preview', {
    form: { payload, expires: String(Number(expires) + 1), signature },
  });
  expect(tampered.status()).toBe(403);
});

function databaseUrl() {
  const url = new URL(
    process.env['HANTEX_TEST_DATABASE_URL'] ?? 'postgres://postgres@127.0.0.1:54329/postgres',
  );
  url.pathname = `/${process.env['E2E_DATABASE']}`;
  return url.toString();
}

test('links shared on social apps show the brand picture, and phones get an icon', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://www.hantexultra.com/brand/share-card.png',
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
  for (const path of ['/brand/share-card.png', '/brand/touch-icon.png']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'], path).toContain('image/png');
  }
});

test('search engines get robots.txt and a sitemap with every language, not previews', async ({
  request,
}) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /preview');
  expect(robots).toContain('Sitemap: https://www.hantexultra.com/sitemap.xml');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('<loc>https://www.hantexultra.com/</loc>');
  expect(sitemap).toContain('<loc>https://www.hantexultra.com/en/</loc>');
  expect(sitemap).toContain('hreflang="en"');
});

test('an unknown address shows a bilingual "not found" page with status 404', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('الصفحة غير موجودة');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

for (const [path, scheme] of [
  ['/', 'light'],
  ['/en/', 'dark'],
  ['/no-such-page', 'light'],
] as const) {
  test(`no serious accessibility problems (${path}, ${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
  });
}
