import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * The first Owner's whole path in a real browser, with a virtual passkey authenticator standing
 * in for a phone's fingerprint or face check: setup link → passkey → dashboard → edit and
 * publish the Coming Soon page → sign out → sign in again with the passkey.
 */

async function addAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test.describe.configure({ mode: 'serial' });

test('the first Owner sets up a passkey, publishes the Coming Soon page and signs in again', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await addAuthenticator(context, page);
  page.on('dialog', (dialog) => void dialog.accept());

  // Arabic and right-to-left by default.
  await page.goto(process.env['E2E_SETUP_LINK'] ?? '');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'قبول الدعوة' })).toBeVisible();
  // The setup token is removed from the address bar once read.
  await expect(page).toHaveURL(/\/accept-invitation$/);
  await expect(page.getByText('owner@example.test')).toBeVisible();

  await page.getByRole('button', { name: 'إنشاء مفتاح مرور' }).click();
  await expect(page).toHaveURL(/\/s\/hantex-ultra$/);
  await expect(page.getByRole('heading', { name: 'Hantex Ultra' })).toBeVisible();

  // Edit and publish the Coming Soon page.
  await page.getByRole('link', { name: 'صفحة «قريبًا»' }).click();
  const headline = page.getByRole('group', { name: 'العنوان الرئيسي' });
  await headline.getByLabel('الإنجليزية').fill('Coming soon to your walls');
  await page.getByRole('button', { name: 'حفظ المسودة' }).click();
  await expect(page.getByRole('status').getByText('تم الحفظ')).toBeVisible();
  await page.getByRole('button', { name: 'نشر', exact: true }).click();
  // Locally no build pipeline is configured, so the version is saved but no rebuild starts.
  await expect(page.getByText(/كنسخة 1/)).toBeVisible();
  await expect(page.getByRole('cell', { name: '#1' })).toBeVisible();

  // Preview: the dashboard signs the draft and posts it to the site's own address.
  await context.route('https://www.hantexultra.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<p id="preview">${route.request().method()} ${route.request().postData() ?? ''}</p>`,
    }),
  );
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'معاينة' }).click();
  const popup = await popupPromise;
  await expect(popup.locator('#preview')).toContainText(
    /^POST payload=.+&expires=\d+&signature=[0-9a-f]{64}/,
  );
  await popup.close();

  // Site settings: publish a contact email.
  await page.getByRole('link', { name: 'إعدادات الموقع' }).click();
  await page.getByLabel('البريد الإلكتروني').fill('hello@example.test');
  await page.getByRole('button', { name: 'نشر', exact: true }).click();
  await expect(page.getByText(/كنسخة 1/)).toBeVisible();

  // Appearance: unreadable colours are reported before publishing.
  await page.getByRole('link', { name: 'المظهر' }).click();
  await expect(page.getByText('كل النصوص مقروءة في الوضعين.')).toBeVisible();
  await page
    .getByRole('group', { name: 'الوضع الفاتح' })
    .first()
    .getByRole('textbox', { name: 'النص', exact: true })
    .fill('#F4F6F8');
  await expect(page.getByRole('alert')).toContainText('النص على خلفية الصفحة');

  // Recovery codes need a fresh sign-in, which this is.
  await page.getByRole('link', { name: 'حسابي' }).click();
  await page.getByRole('button', { name: 'إنشاء رموز استرداد جديدة' }).click();
  await expect(page.getByText('دوّن هذه الرموز الآن')).toBeVisible();
  await expect(page.locator('ul[dir="ltr"] li')).toHaveCount(10);

  // English, left-to-right.
  await page.getByRole('button', { name: 'اللغة' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();

  // Sign out, then back in with the same passkey.
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(/\/s\/hantex-ultra$/);

  // The published content is what the site will build from.
  await page.getByRole('link', { name: 'Coming Soon page' }).click();
  await expect(page.getByRole('group', { name: 'Headline' }).getByLabel('English')).toHaveValue(
    'Coming soon to your walls',
  );

  await context.close();
});

test('a setup link works only once', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(process.env['E2E_SETUP_LINK'] ?? '');
  await expect(page.getByRole('alert')).toContainText('غير صالحة');
  await context.close();
});

test('signed-out visitors are sent to sign in, and the API refuses them', async ({
  page,
  request,
}) => {
  await page.goto('/s/hantex-ultra/subscribers');
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await request.get('/api/sites/hantex-ultra/subscribers')).status()).toBe(401);
});
