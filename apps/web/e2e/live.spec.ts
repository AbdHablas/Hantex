import AxeBuilder from '@axe-core/playwright';
import { DEFAULT_COMING_SOON, DEFAULT_SITE_SETTINGS } from '@hantex/shared';
import { newSection, starterContent } from '@hantex/sections';
import { brandTheme } from '@hantex/theme';
import { expect, test, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import pg from 'pg';

/**
 * A second website, live and made entirely of website-builder pages (D-035), built from content
 * published in the test database and served by its own site Worker (e2e/serve.ts).
 */
const LIVE = `http://localhost:${process.env['E2E_LIVE_PORT'] ?? '8790'}`;
/** The black finish's 3D model on the one-gang switch's page (e2e/serve.ts). */
const BLACK = '6f5e4d3c-2b1a-4c9d-8e7f-0a1b2c3d4e5f';
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

test('a page’s or product’s old address leads to its new one', async ({ request }) => {
  for (const [from, to] of [
    ['/about', '/who-we-are/'],
    ['/about/', '/who-we-are/'],
    ['/en/about', '/en/who-we-are/'],
    // A product's old address (D-050).
    ['/product/old-one', '/product/one-gang/'],
    ['/en/product/old-one/', '/en/product/one-gang/'],
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
    for (const path of [
      '/',
      '/en/',
      '/who-we-are/',
      '/en/contact/',
      '/range/',
      '/en/range/',
      '/product/one-gang/',
      '/en/product/one-gang/',
      '/en/category/switches/',
      '/series/alpha/',
      '/search/',
      '/en/search/',
    ]) {
      await page.goto(`${LIVE}${path}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${width}px`).toBe(0);
    }
    expect(cspErrors).toEqual([]);
  });
}

test('product sections show the published catalogue, and only its visible products (D-048)', async ({
  page,
}) => {
  await page.goto(`${LIVE}/en/range/`);
  const grid = page.getByRole('region', { name: 'Switch range' });
  await expect(grid.getByRole('heading', { level: 3 })).toHaveText([
    'Test one-gang switch',
    'Test two-gang switch',
  ]);
  await expect(grid).toContainText('A test summary.');
  await expect(grid.getByRole('list', { name: 'Finishes' }).first()).toContainText('Test black');
  await expect(page.locator('main')).not.toContainText('Hidden test product');
  // Picked products keep the order they were picked in.
  const featured = page.getByRole('region', { name: 'Products, scroll for more' });
  await expect(featured.getByRole('heading', { level: 3 })).toHaveText([
    'Test two-gang switch',
    'Test one-gang switch',
  ]);
  await expect(page.getByRole('region', { name: 'Categories' })).toContainText('A test category.');

  const specs = page.getByRole('region', { name: 'Specifications' });
  await expect(specs.getByRole('row', { name: 'Rated current 10 A' })).toBeVisible();
  await expect(specs.getByRole('row', { name: 'USB outlet No' })).toBeVisible();
  await expect(specs.getByRole('row', { name: 'TST-1B Test black' })).toBeVisible();

  // A value that wasn't entered is shown as not given, never guessed.
  const compare = page.getByRole('region', { name: 'Compare' });
  await expect(compare.getByRole('row', { name: 'Rated current 10 A Not given' })).toBeVisible();
  await expect(compare.getByRole('row', { name: 'USB outlet No Yes' })).toBeVisible();

  // Cards lead to the product pages, and the menu to the category page.
  await grid.getByRole('link', { name: 'Test one-gang switch' }).click();
  await expect(page).toHaveURL(`${LIVE}/en/product/one-gang/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test one-gang switch');
  await page.getByRole('link', { name: 'Switch catalogue' }).first().click();
  await expect(page).toHaveURL(`${LIVE}/en/category/switches/`);
});

test('a product page shows only what the catalogue holds (D-048)', async ({ page, request }) => {
  await page.goto(`${LIVE}/en/product/one-gang/`);
  await expect(page).toHaveTitle('Test one-gang switch — Test website');
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('listitem')).toHaveText([
    'Home',
    'Test switches',
    'Test one-gang switch',
  ]);
  await expect(page.getByRole('link', { name: 'Test series' })).toHaveAttribute(
    'href',
    '/en/series/alpha/',
  );
  await expect(page.getByText('Second test paragraph.')).toBeVisible();
  await expect(page.getByRole('row', { name: 'Rated current 10 A' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'TST-1W Test white' })).toBeVisible();
  // Only the checked certificate is shown, with what it says.
  const certifications = page.getByRole('region', { name: 'Certifications' });
  await expect(certifications).toContainText('Test mark');
  await expect(certifications).toContainText('TM-001');
  await expect(page.locator('main')).not.toContainText('Unchecked');
  const downloads = page.getByRole('region', { name: 'Downloads' });
  await expect(downloads.getByRole('link')).toHaveText([/Test datasheet/, /Checked certificate/]);
  const href = await downloads.getByRole('link').first().getAttribute('href');
  const file = await request.get(`${LIVE}${href}`);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('application/pdf');
  // It is the only product of its series, so no "same series" list.
  await expect(page.getByRole('region', { name: 'From the same series' })).toHaveCount(0);
  await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveAttribute(
    'href',
    'https://live.example.test/product/one-gang/',
  );
});

test('a product page shows its 3D models: poster first, then the viewer, a model per finish, and "view on your wall" for a true-scale one (D-057, D-058)', async ({
  page,
  request,
}) => {
  const refused: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) refused.push(message.text());
  });
  const model = page.waitForResponse((response) => response.url().endsWith('/desktop.glb'));
  await page.goto(`${LIVE}/en/product/one-gang/`);
  const figure = page.locator('figure.cx-model');
  await expect(figure.locator('figcaption')).toHaveText(
    '3D model made by a 3D artist · true to size',
  );
  // On a computer the viewer loads by itself once the model is on screen; a phone would wait for a tap.
  const viewer = figure.locator('model-viewer');
  await expect(viewer).toHaveAttribute('src', /\/models\/[0-9a-f-]{36}\/desktop\.glb$/);
  expect((await model).status()).toBe(200);
  await expect(viewer).toHaveAttribute('alt', '3D model of Test one-gang switch, Test white');
  await expect(viewer).toHaveAttribute('ar-placement', 'wall');
  await expect(viewer).toHaveAttribute('ar-scale', 'fixed');
  await expect(viewer.locator('[slot="ar-button"]')).toHaveText('View on your wall');
  // Every model file is this site's own, typed and cached for a year.
  const src = (await viewer.getAttribute('src')) ?? '';
  const glb = await request.get(`${LIVE}${src}`);
  expect(glb.headers()['content-type']).toBe('model/gltf-binary');
  expect(glb.headers()['cache-control']).toBe('public, max-age=31536000, immutable');

  // Each finish is its own model (D-058): choosing Black shows Black's, with its own caption.
  // It isn't checked true to size, so it offers no "view on your wall".
  const finishes = page.getByRole('group', { name: 'Finish in 3D' });
  await expect(finishes.getByRole('radio', { name: 'Test white' })).toBeChecked();
  await finishes.getByRole('radio', { name: 'Test black' }).check();
  await expect(viewer).toHaveAttribute('src', new RegExp(`/models/${BLACK}/desktop\\.glb$`));
  await expect(viewer).toHaveAttribute('alt', '3D model of Test one-gang switch, Test black');
  await expect(figure.locator('figcaption')).toHaveText('3D model measured from photos');
  await expect(viewer.locator('[slot="ar-button"]')).toHaveCount(0);
  await expect(viewer).not.toHaveAttribute('ar', '');
  await finishes.getByRole('radio', { name: 'Test white' }).check();
  await expect(viewer.locator('[slot="ar-button"]')).toHaveText('View on your wall');
  await expect(figure.locator('figcaption')).toHaveText(
    '3D model made by a 3D artist · true to size',
  );
  // The viewer's textures and stylesheet are allowed; nothing else was refused.
  expect(refused).toEqual([]);

  // A product without a model shows its photos only, and loads no viewer.
  await page.goto(`${LIVE}/en/product/two-gang/`);
  await expect(page.locator('figure.cx-model')).toHaveCount(0);

  // A phone waits for a tap, then loads the lighter phone version of the finish chosen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${LIVE}/en/product/one-gang/`);
  await expect(
    page.getByRole('img', { name: 'Picture of the 3D model of Test one-gang switch, Test white' }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('model-viewer')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Test black' }).check();
  const blackPoster = page.getByRole('img', {
    name: 'Picture of the 3D model of Test one-gang switch, Test black',
  });
  await expect(blackPoster).toHaveAttribute('src', `/models/${BLACK}/poster-front.webp`);
  await page.getByRole('button', { name: 'View in 3D' }).click();
  const tapped = page.locator('figure.cx-model model-viewer');
  await expect(tapped).toHaveAttribute('src', `/models/${BLACK}/mobile.glb`);
  // Keyboard focus moves into the viewer, and on to the model itself once it shows.
  await expect(tapped).toBeFocused();
  await expect
    .poll(() =>
      tapped.evaluate((element) =>
        element.shadowRoot?.activeElement?.classList.contains('userInput'),
      ),
    )
    .toBe(true);
  // There the arrow keys turn it.
  const turn = () =>
    tapped.evaluate(
      (element) =>
        (element as unknown as { getCameraOrbit(): { theta: number } }).getCameraOrbit().theta,
    );
  const before = await turn();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(turn).not.toBe(before);
});

test('a product page without JavaScript shows the model’s picture, and no controls that do nothing (D-057)', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${LIVE}/en/product/one-gang/`);
  await expect(
    page.getByRole('img', { name: 'Picture of the 3D model of Test one-gang switch, Test white' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'View in 3D' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Finish in 3D' })).toHaveCount(0);
  // Its features are a picture and a list.
  const features = page.getByRole('region', { name: 'Features' });
  await expect(features.getByRole('listitem')).toHaveCount(5);
  await expect(features.locator('[data-features-stage] img')).toHaveAttribute(
    'src',
    /\/poster-front\.webp$/,
  );
  await context.close();
});

test('a product’s features pass beside its 3D model, which turns to each one’s view (D-059)', async ({
  page,
}) => {
  await page.goto(`${LIVE}/en/product/one-gang/`);
  const section = page.getByRole('region', { name: 'Features' });
  const items = section.getByRole('listitem');
  await expect(items).toHaveText([
    /^Test front featureTest text about the front\.$/,
    'Test right-side feature',
    /^Test top feature/,
    'Test back feature',
    'Test left-side feature',
  ]);
  // On a computer the gallery's viewer opens by itself, and the model beside the features comes
  // alive with it. It is decoration: no input, and hidden from assistive technology.
  const stage = section.locator('[data-features-stage]');
  const viewer = stage.locator('model-viewer');
  await expect(viewer).toHaveAttribute('src', /\/desktop\.glb$/);
  await expect(viewer).toHaveAttribute('camera-orbit', '0deg 75deg auto');
  await expect(stage).toHaveAttribute('aria-hidden', 'true');
  await expect(stage).toHaveAttribute('inert', '');
  await expect(viewer).not.toHaveAttribute('camera-controls', '');
  await expect
    .poll(() => viewer.evaluate((v) => (v as unknown as { loaded: boolean }).loaded))
    .toBe(true);

  // The side of the model facing the visitor, read from the model itself at the stage's centre.
  const facing = () =>
    viewer.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = (
        element as unknown as {
          positionAndNormalFromPoint(
            x: number,
            y: number,
          ): { normal: { x: number; y: number; z: number } } | null;
        }
      ).positionAndNormalFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (!hit) return 'nothing';
      const { x, y, z } = hit.normal;
      const [axis, value] = (
        [
          ['x', x],
          ['y', y],
          ['z', z],
        ] as const
      ).reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
      return `${axis}${value > 0 ? '+' : '-'}`;
    });
  /** Scrolls a feature to the reading line: this far down the screen. */
  const read = (index: number, line = 0.5) =>
    items.nth(index).evaluate((item, at) => {
      const box = item.getBoundingClientRect();
      window.scrollBy(0, box.top + box.height / 2 - window.innerHeight * at);
    }, line);
  const tilt = () =>
    viewer.evaluate(
      (v) => (v as unknown as { getCameraOrbit(): { phi: number } }).getCameraOrbit().phi,
    );

  // Each feature, read in turn, turns the model to the side its view names: the front (+z),
  // the right-hand side as seen from the front (+x), from above, the back (-z), the left (-x).
  await read(0);
  await expect(items.nth(0)).toHaveAttribute('data-active', '');
  await expect.poll(facing).toBe('z+');
  await read(1);
  await expect(items.nth(1)).toHaveAttribute('data-active', '');
  await expect(items.nth(0)).not.toHaveAttribute('data-active', '');
  await expect(viewer).toHaveAttribute('camera-orbit', '90deg 75deg auto');
  await expect.poll(facing).toBe('x+');
  await read(2);
  await expect(viewer).toHaveAttribute('camera-orbit', '0deg 15deg auto');
  await expect.poll(async () => Math.round(((await tilt()) * 180) / Math.PI)).toBe(15);
  await read(3);
  await expect.poll(facing).toBe('z-');
  await read(4);
  await expect.poll(facing).toBe('x-');
  // The model stayed in view all the way down.
  await expect(stage).toBeInViewport();

  // It follows the finish chosen in the gallery.
  await page.getByRole('radio', { name: 'Test black' }).check();
  await expect(viewer).toHaveAttribute('src', `/models/${BLACK}/desktop.glb`);

  // A product without a 3D model shows its features as a plain list.
  await page.goto(`${LIVE}/en/product/two-gang/`);
  const plain = page.getByRole('region', { name: 'Features' });
  await expect(plain.getByRole('listitem')).toHaveText(['Test plain featureTest plain text.']);
  await expect(plain.locator('[data-features-stage]')).toHaveCount(0);
});

test('a product’s features stay still with reduced motion, and on a phone until the visitor opens 3D (D-059)', async ({
  browser,
  page,
}) => {
  // Reduced motion: the gallery's viewer still opens (it only moves when the visitor moves it),
  // but the model beside the features stays a picture, the poster nearest the first view.
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const still = await context.newPage();
  await still.goto(`${LIVE}/en/product/one-gang/`);
  await expect(still.locator('figure.cx-model model-viewer')).toHaveAttribute(
    'src',
    /desktop\.glb$/,
  );
  const stillStage = still.locator('[data-features-stage]');
  await expect(stillStage.locator('img')).toHaveAttribute('src', /\/poster-front\.webp$/);
  await expect(stillStage.locator('model-viewer')).toHaveCount(0);
  await expect(still.locator('.cx-features')).not.toHaveClass(/is-live/);
  await context.close();

  // A phone loads no 3D until the visitor asks for it; then the features' model comes alive
  // too, and turns as each feature reaches the reading line under it.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${LIVE}/en/product/one-gang/`);
  const stage = page.locator('[data-features-stage]');
  await stage.scrollIntoViewIfNeeded();
  await expect(stage.locator('img')).toBeVisible();
  await expect(page.locator('model-viewer')).toHaveCount(0);
  await page.getByRole('button', { name: 'View in 3D' }).click();
  const viewer = stage.locator('model-viewer');
  await expect(viewer).toHaveAttribute('src', /\/mobile\.glb$/);
  const second = page.getByRole('region', { name: 'Features' }).getByRole('listitem').nth(1);
  await second.evaluate((item) => {
    const box = item.getBoundingClientRect();
    window.scrollBy(0, box.top + box.height / 2 - window.innerHeight * 0.7);
  });
  await expect(second).toHaveAttribute('data-active', '');
  await expect(viewer).toHaveAttribute('camera-orbit', '90deg 75deg auto');
  await expect(stage).toBeInViewport();
});

test('a product enquiry reaches the server and is refused without a passed security check (D-051)', async ({
  page,
}) => {
  // A stand-in for Turnstile that hands back a token; the site Worker runs with Turnstile's
  // always-failing test secret, so the server must refuse the enquiry and store nothing.
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'window.turnstile = { render: (el, o) => { setTimeout(() => o.callback("test-token")); return "w"; }, reset: () => {} };',
    }),
  );
  await page.goto(`${LIVE}/en/product/one-gang/`);
  await page.getByRole('link', { name: 'Ask about this product' }).click();
  const form = page.getByRole('region', { name: 'Ask about this product' });
  await expect(form).toContainText('About: Test one-gang switch');
  await form.getByText('A quotation', { exact: true }).click();
  await expect(form.getByRole('radio', { name: 'A quotation' })).toBeChecked();
  await form.getByLabel('Name').fill('Visitor');
  // Checked in the browser first, with the same rules as the server.
  await form.getByRole('button', { name: 'Send' }).click();
  await expect(form.getByRole('status')).toHaveText(
    'Enter a valid email address or WhatsApp number.',
  );
  await form.getByLabel('Email or WhatsApp number').fill('visitor@example.test');
  await form.getByLabel('Quantity (optional)').fill('20');
  await form.getByLabel('Your message').fill('Price for 20, please.');
  await form.getByLabel(/I agree that/).check();
  await page.waitForFunction(() => 'turnstile' in window);
  await form.getByRole('button', { name: 'Send' }).click();
  await expect(form.getByRole('status')).toHaveText('The security check failed. Please try again.');

  const url = new URL(
    process.env['HANTEX_TEST_DATABASE_URL'] ?? 'postgres://postgres@127.0.0.1:54329/postgres',
  );
  url.pathname = `/${process.env['E2E_DATABASE']}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  const rows = await client.query('select 1 from enquiries');
  await client.end();
  expect(rows.rowCount).toBe(0);
});

test('category filters narrow the list, and clearing shows every product again (D-052)', async ({
  page,
}) => {
  await page.goto(`${LIVE}/en/category/switches/`);
  const filters = page.getByRole('form', { name: 'Filter products' });
  await expect(filters).toBeVisible();
  const products = page.getByRole('region', { name: 'Products', exact: true });
  const names = products.locator('li:visible').getByRole('heading', { level: 3 });
  await expect(names).toHaveText(['Test one-gang switch', 'Test two-gang switch']);
  await filters.getByRole('group', { name: 'Gangs' }).getByLabel('2').check();
  await expect(names).toHaveText(['Test two-gang switch']);
  await expect(filters.getByRole('status')).toHaveText('Showing 1 of 2 products');
  // Across filters, every one must match: no two-gang switch comes in black.
  await filters.getByRole('group', { name: 'Finishes' }).getByLabel('Test black').check();
  await expect(names).toHaveCount(0);
  await expect(filters.getByText('No products match these choices.')).toBeVisible();
  await filters.getByRole('button', { name: 'Clear filters' }).click();
  await expect(names).toHaveText(['Test one-gang switch', 'Test two-gang switch']);
});

test('site search finds products in English and Arabic, and nothing hidden (D-052)', async ({
  page,
}) => {
  const cspErrors: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) cspErrors.push(message.text());
  });
  await page.goto(`${LIVE}/en/product/one-gang/`);
  await page.getByRole('link', { name: 'Search' }).click();
  await expect(page).toHaveURL(`${LIVE}/en/search/`);
  const search = page.getByRole('search');
  await search.getByLabel('Search this website').fill('two-gang');
  await search.getByRole('button', { name: 'Search' }).click();
  const results = page.locator('[data-search-results]');
  await expect(results.getByRole('link', { name: 'Test two-gang switch' })).toHaveAttribute(
    'href',
    '/en/product/two-gang/',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Results' })).toBeVisible();
  // A shared address searches straight away; hidden products were never indexed.
  await page.goto(`${LIVE}/en/search/?q=Hidden`);
  await expect(page.getByText('No results for “Hidden”.')).toBeVisible();
  // Arabic searches the Arabic pages.
  await page.goto(`${LIVE}/search/?q=${encodeURIComponent('مزدوج')}`);
  await expect(
    page.locator('[data-search-results]').getByRole('link', { name: 'مفتاح تجريبي مزدوج' }),
  ).toBeVisible();
  expect(cspErrors).toEqual([]);
});

test('only search may compile WebAssembly (D-052)', async ({ request }) => {
  const csp = async (path: string) =>
    (await request.get(`${LIVE}${path}`)).headers()['content-security-policy'] ?? '';
  for (const path of ['/search/', '/en/search/', '/pagefind/pagefind.js']) {
    expect(await csp(path), path).toContain("'wasm-unsafe-eval'");
  }
  for (const path of ['/', '/en/product/one-gang/']) {
    const policy = await csp(path);
    expect(policy, path).toContain("script-src 'self'");
    expect(policy, path).not.toContain('wasm-unsafe-eval');
  }
});

/** Every JSON-LD block of a page, parsed. */
async function structuredData(page: Page) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((text) => JSON.parse(text) as Record<string, unknown>);
}

test('product pages tell search engines only the facts entered (D-053)', async ({ page }) => {
  await page.goto(`${LIVE}/en/product/one-gang/`);
  const data = await structuredData(page);
  const product = data.find((d) => d['@type'] === 'ProductGroup')!;
  expect(product).toMatchObject({
    name: 'Test one-gang switch',
    url: 'https://live.example.test/en/product/one-gang/',
    description: 'A test summary.',
    category: 'Test switches',
    variesBy: 'https://schema.org/color',
    hasVariant: [
      {
        '@type': 'Product',
        name: 'Test one-gang switch — Test white',
        sku: 'TST-1W',
        color: 'Test white',
      },
      {
        '@type': 'Product',
        name: 'Test one-gang switch — Test black',
        sku: 'TST-1B',
        color: 'Test black',
      },
    ],
    hasCertification: [
      {
        '@type': 'Certification',
        name: 'Test mark',
        certificationIdentification: 'TM-001',
        issuedBy: { '@type': 'Organization', name: 'Test lab' },
      },
    ],
  });
  expect(product['additionalProperty']).toContainEqual({
    '@type': 'PropertyValue',
    name: 'Rated current',
    value: 10,
    unitText: 'A',
  });
  expect((product['image'] as string[])[0]).toMatch(/^https:\/\/live\.example\.test\/media\//);
  // Nothing that wasn't entered: no prices, offers, ratings, brand or unchecked certificate.
  const text = JSON.stringify(data);
  for (const absent of ['offers', 'price', 'aggregateRating', 'review', 'brand', 'Unchecked']) {
    expect(text, absent).not.toContain(absent);
  }
  const crumbs = data.find((d) => d['@type'] === 'BreadcrumbList')!;
  expect((crumbs['itemListElement'] as { name: string }[]).map((i) => i.name)).toEqual([
    'Home',
    'Test switches',
    'Test one-gang switch',
  ]);
  // Arabic pages describe themselves in Arabic.
  await page.goto(`${LIVE}/product/one-gang/`);
  const arabic = (await structuredData(page)).find((d) => d['@type'] === 'ProductGroup')!;
  expect(arabic['name']).toBe('مفتاح تجريبي واحد');
});

test('the home page describes the website from its settings, and lists pages search engines know (D-053)', async ({
  page,
}) => {
  await page.goto(`${LIVE}/en/`);
  const data = await structuredData(page);
  expect(data.find((d) => d['@type'] === 'WebSite')).toMatchObject({
    name: 'Test website',
    url: 'https://live.example.test/en/',
    inLanguage: 'en',
  });
  expect(data.find((d) => d['@type'] === 'Organization')).toMatchObject({
    name: 'Test website',
    email: 'live@example.test',
  });
  await page.goto(`${LIVE}/en/category/switches/`);
  const list = (await structuredData(page)).find((d) => d['@type'] === 'ItemList')!;
  expect((list['itemListElement'] as { url: string }[]).map((i) => i.url)).toEqual([
    'https://live.example.test/en/product/one-gang/',
    'https://live.example.test/en/product/two-gang/',
  ]);
  // Other pages carry none.
  await page.goto(`${LIVE}/en/contact/`);
  expect(await structuredData(page)).toEqual([]);
});

test('category and series pages list their visible products', async ({ page }) => {
  await page.goto(`${LIVE}/en/category/switches/`);
  const products = page.getByRole('region', { name: 'Products', exact: true });
  await expect(products.getByRole('heading', { level: 3 })).toHaveText([
    'Test one-gang switch',
    'Test two-gang switch',
  ]);
  await expect(page.locator('main')).not.toContainText('Hidden test product');
  await page.goto(`${LIVE}/series/alpha/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('سلسلة تجريبية');
  await expect(
    page.getByRole('region', { name: 'المنتجات' }).getByRole('heading', { level: 3 }),
  ).toHaveText(['مفتاح تجريبي واحد']);
  // A hidden product has no page.
  expect((await page.goto(`${LIVE}/en/product/hidden/`))?.status()).toBe(404);
});

test('product sections read right to left in Arabic, with Latin digits', async ({ page }) => {
  await page.goto(`${LIVE}/range/`);
  const specs = page.getByRole('region', { name: 'المواصفات' });
  await expect(specs.getByRole('row', { name: 'التيار المقنن 10 A' })).toBeVisible();
});

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
    '/product/one-gang/',
    '/en/product/two-gang/',
    '/category/switches/',
    '/en/series/alpha/',
  ]) {
    expect(sitemap).toContain(`<loc>https://live.example.test${path}</loc>`);
  }
  expect(sitemap).not.toContain('/product/hidden/');
});

for (const [path, scheme] of [
  ['/', 'light'],
  ['/en/', 'dark'],
  ['/en/contact/', 'light'],
  ['/range/', 'dark'],
  ['/en/range/', 'light'],
  ['/product/one-gang/', 'light'],
  ['/en/product/one-gang/', 'dark'],
  ['/en/category/switches/', 'light'],
  ['/series/alpha/', 'dark'],
  ['/en/search/', 'light'],
  ['/search/', 'dark'],
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
