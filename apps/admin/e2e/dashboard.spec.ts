import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
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

/** Answers the dashboard's confirmation dialog; `ifAsked` when it only sometimes appears. */
/** No serious or critical accessibility problems on the page as it is now (D-043). */
async function expectAccessible(page: Page, label: string) {
  await page.waitForTimeout(300);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    label,
  ).toEqual([]);
}

/** A solid-colour PNG, built here so the upload test needs no image file in the repository. */
function png(width: number, height: number) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (data: Buffer) => {
    let c = 0xffffffff;
    for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x5a)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function confirm(page: Page, ifAsked = false) {
  const dialog = page.getByRole('alertdialog');
  if (ifAsked) {
    const shown = await dialog
      .waitFor({ state: 'visible', timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    if (!shown) return;
  }
  await dialog.getByRole('button', { name: /^(تأكيد|Confirm)$/ }).click();
  await expect(dialog).toBeHidden();
}

test('the first Owner sets up a passkey, publishes the Coming Soon page and signs in again', async ({
  browser,
}) => {
  // A long journey through the whole dashboard; shared CI machines run it two to three times slower.
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await addAuthenticator(context, page);
  const cspErrors: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) cspErrors.push(message.text());
  });

  // Arabic and right-to-left by default.
  await page.goto(process.env['E2E_SETUP_LINK'] ?? '');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expectAccessible(page, 'accept invitation');
  await expect(page.getByRole('heading', { name: 'قبول الدعوة' })).toBeVisible();
  // The setup token is removed from the address bar once read.
  await expect(page).toHaveURL(/\/accept-invitation$/);
  await expect(page.getByText('owner@example.test')).toBeVisible();

  await page.getByRole('button', { name: 'إنشاء مفتاح مرور' }).click();
  await expect(page).toHaveURL(/\/s\/hantex-ultra$/);
  await expect(page.getByRole('heading', { name: 'نظرة عامة' })).toBeVisible();
  await expectAccessible(page, 'overview');
  // No CSP violations from the interface components (menus, tooltips, charts).
  expect(cspErrors).toEqual([]);

  // Edit and publish the Coming Soon page.
  await page.getByRole('link', { name: 'صفحة «قريبًا»', exact: true }).click();
  const headline = page.getByRole('group', { name: 'العنوان الرئيسي' });
  await expectAccessible(page, 'coming soon editor');
  await headline.getByLabel('الإنجليزية').fill('Coming soon to your walls');
  await page.getByRole('button', { name: 'حفظ المسودة' }).click();
  await expect(page.getByRole('status').getByText('تم الحفظ')).toBeVisible();
  await page.getByRole('button', { name: 'نشر', exact: true }).click();
  await confirm(page);
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
  await page.getByRole('link', { name: 'البحث والتواصل', exact: true }).click();
  await page.getByLabel('البريد الإلكتروني').fill('hello@example.test');
  await page.getByRole('button', { name: 'نشر', exact: true }).click();
  await confirm(page);
  await expect(page.getByText(/كنسخة 1/)).toBeVisible();

  // Appearance: unreadable colours are reported before publishing.
  await page.getByRole('link', { name: 'المظهر', exact: true }).click();
  await expectAccessible(page, 'appearance');
  await expect(page.getByText('كل النصوص مقروءة في الوضعين.')).toBeVisible();
  await page
    .getByRole('group', { name: 'الوضع الفاتح' })
    .first()
    .getByRole('textbox', { name: 'النص', exact: true })
    .fill('#F4F6F8');
  await expect(page.getByRole('alert')).toContainText('النص على خلفية الصفحة');
  // Typography: text below the readable minimum is reported before publishing (D-032).
  await page.getByRole('tab', { name: 'النص', exact: true }).click();
  await page
    .getByRole('group', { name: 'النص', exact: true })
    .getByLabel('الحجم (بكسل)')
    .fill('12');
  await expect(page.getByText('النص: استخدم 14 بكسل على الأقل.')).toBeVisible();

  // Recovery codes need a fresh sign-in, which this is.
  // Personal pages live in the account menu at the foot of the sidebar.
  await page.getByRole('button', { name: 'قائمة الحساب' }).click();
  await page.getByRole('menuitem', { name: 'حسابي' }).click();
  await page.getByRole('button', { name: 'إنشاء رموز استرداد جديدة' }).click();
  await confirm(page, true);
  await expect(page.getByText('دوّن هذه الرموز الآن')).toBeVisible();
  await expect(page.locator('ul[dir="ltr"] li')).toHaveCount(10);

  // Phones: every main page fits without sideways scrolling, and the menu slides in.
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of [
    '/s/hantex-ultra',
    '/s/hantex-ultra/coming-soon',
    '/s/hantex-ultra/appearance',
    '/s/hantex-ultra/subscribers',
    '/s/hantex-ultra/settings',
    '/sites',
    '/roles',
    '/account',
  ]) {
    await page.goto(path);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto('/s/hantex-ultra');
  await page.getByRole('button', { name: 'القائمة' }).click();
  await page
    .getByRole('dialog', { name: 'القائمة' })
    .getByRole('link', { name: 'المظهر', exact: true })
    .click();
  await expect(page).toHaveURL(/\/appearance$/);
  await expect(page.getByRole('dialog', { name: 'القائمة' })).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/account');

  // English, left-to-right.
  await page.getByRole('button', { name: 'اللغة' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
  await expectAccessible(page, 'account (English)');
  await page.goto('/roles');
  await expectAccessible(page, 'roles (English)');
  await page.goto('/sites');
  await expectAccessible(page, 'websites (English)');

  // The website builder (D-035 to D-038): a second website, made and published without code.
  await page.getByRole('button', { name: 'New website' }).first().click();
  const create = page.getByRole('dialog', { name: 'New website' });
  await create.getByLabel('Short key').fill('second-site');
  await create.getByLabel('Name in Arabic').fill('الموقع الثاني');
  await create.getByLabel('Name in English').fill('Second site');
  await create.getByRole('radio', { name: /Business/ }).check();
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/s\/second-site\/settings$/);

  await page.getByRole('link', { name: 'Pages', exact: true }).click();
  const pageList = page.getByRole('list').filter({ hasText: 'About us' });
  await expect(pageList.getByRole('link')).toHaveText(['Home', 'About us', 'Contact']);
  await expectAccessible(page, 'pages');
  await pageList.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  // No domain yet, so the device preview explains what it needs.
  await expect(page.getByText('Add a main domain in General settings')).toBeVisible();
  await page.getByRole('button', { name: 'Add section' }).click();
  await page
    .getByRole('dialog', { name: 'Choose a section' })
    .getByRole('button', { name: /^Call to action/ })
    .click();
  await page.getByRole('group', { name: 'Heading' }).getByLabel('English').fill('Talk to our team');
  await page.getByRole('group', { name: 'Heading' }).getByLabel('Arabic').fill('تحدث إلى فريقنا');
  // Shown on desktops only.
  await page.getByRole('checkbox', { name: 'Phones' }).uncheck();
  await expectAccessible(page, 'page editor');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByText(/Hidden on Phones/)).toBeVisible();
  // Reusable: the section moves into the website's saved sections; the page keeps a reference.
  await page.getByRole('button', { name: 'Actions for Call to action' }).click();
  await page.getByRole('menuitem', { name: 'Save as reusable section' }).click();
  await expect(page.getByText('Saved section', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();

  // Rich text: formatting is stored as data, never HTML.
  await page.getByRole('link', { name: 'All pages' }).click();
  await pageList.getByRole('link', { name: 'About us' }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  const english = page.getByRole('textbox', { name: 'Text (English)' });
  await english.click();
  await page.keyboard.type('We make switches. ');
  const bold = page
    .getByRole('toolbar', { name: 'Text formatting (Text (English))' })
    .getByRole('button', { name: 'Bold' });
  await bold.click();
  // Type only once bold is on and the cursor is back in the text.
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(english).toBeFocused();
  await page.keyboard.type('Quality first.');
  await expect(english.locator('strong')).toHaveText('Quality first.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();

  // Menus: a dropdown link in the header menu.
  await page.getByRole('link', { name: 'Menus, header & footer', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Add dropdown link' }).click();
  await page.getByRole('group', { name: 'Dropdown links' }).getByLabel('English').fill('Our team');
  await page.getByRole('group', { name: 'Dropdown links' }).getByLabel('Arabic').fill('فريقنا');
  await expectAccessible(page, 'menus');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();

  // Publish changes: everything changed on this website, together.
  await expect(page.getByText(/unpublished changes on this website/)).toBeVisible();
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await confirm(page);
  await expect(page.getByText('Changes published.')).toBeVisible();
  await expect(page.getByText('Everything is published.')).toBeVisible();
  // Each page keeps its published versions, ready to restore into the draft.
  await page.goto('/s/second-site/pages');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('cell', { name: '#1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore to draft' })).toBeVisible();
  // The privacy policy starts as a hidden draft for the owner's review (D-041).
  await page.getByRole('link', { name: 'All pages' }).click();
  await page.getByRole('button', { name: 'New page' }).click();
  await page.getByRole('radio', { name: /Privacy policy draft/ }).check();
  await page
    .getByRole('dialog', { name: 'New page' })
    .getByRole('button', { name: 'Create' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Show this page on the website' }),
  ).not.toBeChecked();

  // Phones and tablets: the builder fits without sideways scrolling.
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/s/second-site/pages', '/s/second-site/menus']) {
      await page.goto(path);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // Launch announcement (D-040): prepared in English only, sent within the daily limit.
  await page.goto('/s/hantex-ultra/subscribers');
  const announce = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Announcement email' }) });
  await announce
    .getByRole('group', { name: 'Subject' })
    .getByLabel('English')
    .fill('We have launched');
  await announce
    .getByRole('group', { name: 'Message' })
    .getByLabel('English')
    .fill('Come and see.');
  await announce.getByRole('button', { name: 'Prepare announcement' }).click();
  await expect(announce.getByText('Not finished')).toBeVisible();
  await expectAccessible(page, 'sign-ups with an announcement');
  await announce.getByRole('button', { name: 'Send', exact: true }).click();
  await confirm(page);
  await expect(announce.getByText('Everyone has received the announcement.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export WhatsApp numbers' })).toHaveAttribute(
    'href',
    /type=whatsapp/,
  );

  // Media library (D-044): the image is resized to WebP in the browser, then described.
  await page.goto('/s/hantex-ultra/media');
  await expect(page.getByText('No images yet.')).toBeVisible();
  await page
    .getByLabel('Upload images')
    .setInputFiles({ name: 'switch.png', mimeType: 'image/png', buffer: png(640, 480) });
  await expect(page.getByText('Images uploaded: 1.')).toBeVisible();
  await expectAccessible(page, 'media library');
  await page.getByRole('button', { name: /switch\.png/ }).click();
  const details = page.getByRole('dialog', { name: 'Image details' });
  await expect(details.getByText('640 × 480 px')).toBeVisible();
  await expect
    .poll(() => details.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(640);
  await details
    .getByRole('group', { name: /Description for people/ })
    .getByLabel('English')
    .fill('A grey square');
  await details.getByRole('button', { name: 'Save' }).click();
  await expect(details).toBeHidden();
  await expect(page.getByRole('button', { name: /A grey square/ })).toBeVisible();
  await page.getByRole('button', { name: /switch\.png/ }).click();
  await details.getByRole('button', { name: 'Delete image' }).click();
  await confirm(page);
  await expect(page.getByText('No images yet.')).toBeVisible();

  // An image section on the second website uses an image from its own library, which then
  // can't be deleted while the page uses it.
  await page.goto('/s/second-site/media');
  await page
    .getByLabel('Upload images')
    .setInputFiles({ name: 'plate.png', mimeType: 'image/png', buffer: png(800, 600) });
  await expect(page.getByText('Images uploaded: 1.')).toBeVisible();
  await page.goto('/s/second-site/pages');
  await pageList.getByRole('link', { name: 'About us' }).click();
  await page.getByRole('button', { name: 'Add section' }).click();
  await page
    .getByRole('dialog', { name: 'Choose a section' })
    .getByRole('button', { name: /^Image\s*One image/ })
    .click();
  const imageField = page.getByRole('group', { name: 'Image', exact: true });
  await expect(imageField.getByText('No image chosen.')).toBeVisible();
  await imageField.getByRole('button', { name: 'Choose image' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose an image' });
  await expectAccessible(page, 'image picker');
  await picker.getByRole('button', { name: /plate\.png/ }).click();
  await expect(picker).toBeHidden();
  await expect(imageField.getByText('plate.png')).toBeVisible();
  // A video section takes a YouTube or Vimeo link, nothing else (D-046).
  await page.getByRole('button', { name: 'Add section' }).click();
  await page
    .getByRole('dialog', { name: 'Choose a section' })
    .getByRole('button', { name: /^Video\s*A YouTube/ })
    .click();
  const videoLink = page.getByLabel('Video link');
  const notVideo = page.getByText('That isn’t a YouTube or Vimeo video link.');
  await videoLink.fill('https://example.com/watch?v=dQw4w9WgXcQ');
  await expect(notVideo).toBeVisible();
  await videoLink.fill('https://youtu.be/dQw4w9WgXcQ');
  await expect(notVideo).toBeHidden();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
  await page.goto('/s/second-site/media');
  await page.getByRole('button', { name: /plate\.png/ }).click();
  await details.getByRole('button', { name: 'Delete image' }).click();
  await confirm(page);
  await expect(details.getByText(/Used on: About us\./)).toBeVisible();
  await details.getByRole('button', { name: 'Cancel' }).click();

  // An uploaded logo (D-027) is cleaned in the browser, its colours mapped, then published.
  await page.goto('/s/second-site/logo');
  await expect(
    page.getByText('No logo uploaded. The website shows its name as text.'),
  ).toBeVisible();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40"><script>alert(1)</script><rect width="40" height="40" fill="#1b1e24"/><circle cx="20" cy="20" r="6" fill="#ff6600"/></svg>',
      ),
    });
  await expect(page.getByText('Left out while cleaning: script.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Preview in dark mode' }).first()).toBeVisible();
  await page.getByLabel('Colour #1b1e24').selectOption('neutral');
  await expectAccessible(page, 'logo');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await confirm(page);
  await expect(page.getByText(/as version 1[.,]/)).toBeVisible();

  // An uploaded font (D-033): checked, stored with its licence, then offered in Appearance.
  await page.goto('/fonts');
  await expect(page.getByText('No fonts uploaded yet.', { exact: false })).toBeVisible();
  const cairo = join(
    dirname(createRequire(import.meta.url).resolve('@fontsource/cairo/package.json')),
    'files',
  );
  await page
    .getByLabel('WOFF2 files')
    .setInputFiles([400, 700].map((w) => join(cairo, `cairo-latin-${w}-normal.woff2`)));
  await page.getByLabel('Licence', { exact: true }).fill('SIL Open Font License 1.1');
  await page.getByLabel(/I confirm this font’s licence/).check();
  await page.getByRole('button', { name: 'Check and upload' }).click();
  await expect(page.getByText(/was added to the font library/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cairo' })).toBeVisible();
  await expect(page.getByText('400 · 700')).toBeVisible();
  await expectAccessible(page, 'fonts');
  await page.goto('/s/second-site/appearance');
  await expect(
    page
      .getByRole('combobox')
      .filter({ has: page.getByRole('option', { name: 'Cairo · uploaded' }) }),
  ).toHaveCount(2);

  // The product catalogue (D-026, D-045): structure first, then a product, published together.
  await page.goto('/s/second-site/products');
  await expect(
    page.getByText('Products belong to categories, so add categories first.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Go to catalogue setup' }).click();
  await page.getByRole('tab', { name: 'Attributes' }).click();
  await page.getByLabel('Starter set').selectOption({ label: 'Switches and sockets' });
  await page.getByRole('button', { name: 'Add starter attributes' }).click();
  await expect(page.getByText(/attributes added\. Save the draft/)).toBeVisible();
  await page.getByRole('tab', { name: 'Categories' }).click();
  await page.getByRole('button', { name: 'Add category' }).click();
  const categoryDialog = page.getByRole('dialog', { name: 'Category' });
  await categoryDialog.getByRole('group', { name: 'Name' }).getByLabel('English').fill('Switches');
  await categoryDialog.getByRole('group', { name: 'Name' }).getByLabel('Arabic').fill('مفاتيح');
  await expect(categoryDialog.getByLabel('Address')).toHaveValue('switches');
  await categoryDialog.getByLabel('Main category').check();
  await categoryDialog.getByLabel('Rated current').check();
  await expectAccessible(page, 'category dialog');
  await categoryDialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('tab', { name: 'Finishes' }).click();
  await page.getByRole('button', { name: 'Add finish' }).click();
  const finishDialog = page.getByRole('dialog', { name: 'Finish' });
  await finishDialog.getByRole('group', { name: 'Name' }).getByLabel('English').fill('White');
  await finishDialog.getByRole('group', { name: 'Name' }).getByLabel('Arabic').fill('أبيض');
  await finishDialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('tab', { name: 'Series' }).click();
  await page.getByRole('button', { name: 'Add series' }).click();
  const seriesDialog = page.getByRole('dialog', { name: 'Series' });
  await seriesDialog.getByRole('group', { name: 'Name' }).getByLabel('English').fill('Classic');
  await seriesDialog.getByRole('group', { name: 'Name' }).getByLabel('Arabic').fill('كلاسيك');
  await expect(seriesDialog.getByLabel('Address')).toHaveValue('classic');
  await seriesDialog.getByLabel('White').check();
  await expectAccessible(page, 'series dialog');
  await seriesDialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved. It goes live with Publish changes.')).toBeVisible();
  await expectAccessible(page, 'catalogue structure');

  // Files (PDF) are saved as soon as they are uploaded; anything else is refused.
  await page.getByRole('tab', { name: 'Files' }).click();
  const pdf = (body: string) =>
    Buffer.from(`%PDF-1.7\n${body}\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'latin1');
  await page.getByLabel('Upload PDF').setInputFiles({
    name: 'script.pdf',
    mimeType: 'application/pdf',
    buffer: pdf('1 0 obj\n<< /S /JavaScript /JS (x) >>\nendobj'),
  });
  await expect(page.getByText(/This file can’t be used/)).toBeVisible();
  await page.getByLabel('Upload PDF').setInputFiles({
    name: 'Example certificate.pdf',
    mimeType: 'application/pdf',
    buffer: pdf('1 0 obj\n<< /Type /Catalog >>\nendobj'),
  });
  await expect(page.getByText('Example certificate.pdf uploaded.')).toBeVisible();
  await expect(page.getByText('Not attached')).toBeVisible();
  await expectAccessible(page, 'catalogue files');

  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'New product' }).click();
  const newProduct = page.getByRole('dialog', { name: 'New product' });
  await newProduct
    .getByRole('group', { name: 'Name' })
    .getByLabel('English')
    .fill('One-gang switch');
  await newProduct.getByRole('group', { name: 'Name' }).getByLabel('Arabic').fill('مفتاح خط واحد');
  await newProduct.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'One-gang switch' })).toBeVisible();
  await page.getByLabel('Show on the website').check();
  await page.getByLabel('Rated current (A)').fill('16');
  await page.getByRole('button', { name: 'Add variant' }).click();
  await page.getByLabel('Product code').fill('HX-1001');
  await page.getByLabel('Finish', { exact: true }).selectOption({ label: 'White' });
  await page.getByLabel('Series', { exact: true }).selectOption({ label: 'Classic' });
  await page.getByRole('button', { name: 'Attach document' }).click();
  const documentDialog = page.getByRole('dialog', { name: 'Document' });
  await documentDialog.getByLabel('File', { exact: true }).selectOption({
    label: 'Example certificate.pdf',
  });
  await documentDialog.getByLabel('Kind of document').selectOption({ label: 'Certificate' });
  await documentDialog.getByRole('group', { name: 'Title' }).getByLabel('English').fill('Test');
  await documentDialog.getByRole('group', { name: 'Title' }).getByLabel('Arabic').fill('اختبار');
  await documentDialog.getByLabel('Mark or standard').fill('Example mark');
  await expectAccessible(page, 'document dialog');
  await documentDialog.getByRole('button', { name: 'Done' }).click();
  // Verification waits for the save, and needs a confirmation.
  await expect(page.getByRole('button', { name: 'Mark verified' })).toBeDisabled();
  await expectAccessible(page, 'product editor');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved. It goes live with Publish changes.')).toBeVisible();
  await expect(page.getByText('Not verified: not shown as a certification')).toBeVisible();
  await page.getByRole('button', { name: 'Mark verified' }).click();
  await confirm(page);
  await expect(page.getByText(/^Verified on /)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove verification' })).toBeVisible();

  // A finish a series or product uses can't be removed from the structure.
  await page.goto('/s/second-site/catalogue');
  await page.getByRole('tab', { name: 'Finishes' }).click();
  await page.getByRole('button', { name: 'Delete White' }).click();
  await confirm(page);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/A series still uses a finish you removed/)).toBeVisible();
  await page.getByRole('button', { name: 'Discard changes' }).click();

  await page.goto('/s/second-site/products');
  await expect(page.getByText('Not published')).toBeVisible();
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await confirm(page);
  await expect(page.getByText('Changes published.')).toBeVisible();
  await expect(page.getByText('Not published')).toBeHidden();
  await expectAccessible(page, 'products');

  // The first website is unchanged: its pages are its own.
  await page.goto('/s/hantex-ultra/pages');
  await expect(page.getByText('No pages yet')).toBeVisible();
  await page.goto('/account');

  // Sign out, then back in with the same passkey.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(/\/s\/hantex-ultra$/);

  // The published content is what the site will build from.
  await page.getByRole('link', { name: 'Coming Soon page', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Headline' }).getByLabel('English')).toHaveValue(
    'Coming soon to your walls',
  );

  // The whole chain: the public site's build reads the published version from the database.
  const web = fileURLToPath(new URL('../../web/', import.meta.url));
  execFileSync('pnpm', ['data'], {
    cwd: web,
    stdio: 'pipe',
    env: {
      ...process.env,
      SITE: 'hantex-ultra',
      HANTEX_BUILD_DATABASE_URL: process.env['E2E_BUILD_DATABASE_URL'],
    },
  });
  const built = JSON.parse(await readFile(join(web, 'src', 'data', 'site.json'), 'utf8')) as {
    source: string;
    comingSoon: { headline: { en: string } };
  };
  expect(built.source).toBe('database');
  expect(built.comingSoon.headline.en).toBe('Coming soon to your walls');
  expect(cspErrors).toEqual([]);

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
