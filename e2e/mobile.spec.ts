/**
 * Phones: the screens that used to break on a phone stay usable.
 *
 *   - The parent portal fits the screen (it used to grow to ~505 px: the
 *     header did not wrap, its page links got 0 px and logout sat off-screen),
 *     and its bottom tab bar navigates.
 *   - The staff header keeps its menu button at 320 px.
 *   - The branch switcher opens inside the screen.
 *   - "Record payment" stays inside the trainee's subscription card.
 *
 * Runs at the narrowest common phone (320 px) and a common Android (412 px),
 * in English and Arabic (right to left).
 */

import { test, expect, devices, type Page } from '@playwright/test';
import { readState } from './fixture';

const state = readState();

/** A phone's screen, touch and user agent, in the Chromium these tests run in. */
function phone(name: keyof typeof devices) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { defaultBrowserType, ...emulation } = devices[name];
  return emulation;
}

const PHONES = {
  '320px': phone('iPhone SE'),
  '412px': phone('Pixel 7'),
};

async function logIn(page: Page, locale: string, phone: string, password: string, lands: string) {
  await page.goto(`/${locale}/login`);
  await page.locator('#login-phone').fill(phone);
  await page.locator('#login-password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**/${locale}/${lands}`);
}

/** The page is no wider than the phone, and nothing scrolls it sideways. */
async function expectFitsScreen(page: Page, width: number) {
  const size = await page.evaluate(() => ({
    inner: window.innerWidth,
    doc: document.documentElement.scrollWidth,
  }));
  // A mobile browser widens its layout viewport to fit content that is too
  // wide, so innerWidth has to be checked too, not only the scroll width.
  expect(size.inner).toBe(width);
  expect(size.doc).toBeLessThanOrEqual(width);
}

/** The element's box lies inside the screen's width. */
async function expectInsideScreen(page: Page, testIdOrLocator: ReturnType<Page['locator']>, width: number) {
  const box = await testIdOrLocator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
}

for (const [phone, device] of Object.entries(PHONES)) {
  const width = device.viewport.width;

  test.describe(`${phone} phone`, () => {
    test.use({ ...device });

    for (const locale of ['en', 'ar'] as const) {
      test(`parent portal fits and its tab bar navigates (${locale})`, async ({ page }) => {
        await logIn(page, locale, state.expiring.guardianPhone, state.expiring.guardianPassword, 'portal');

        const tabs = page.getByTestId('portal-tabbar');
        await expect(tabs.getByRole('link')).toHaveCount(5);
        await expectFitsScreen(page, width);
        await expectInsideScreen(page, page.getByRole('button', { name: locale === 'en' ? 'Logout' : 'تسجيل الخروج' }), width);

        for (const route of ['schedule', 'attendance', 'subscription', 'receipts']) {
          await tabs.locator(`a[href="/${locale}/portal/${route}"]`).click();
          await page.waitForURL(`**/${locale}/portal/${route}`);
          await expect(tabs.locator(`a[href="/${locale}/portal/${route}"]`)).toHaveAttribute('aria-current', 'page');
          await expectFitsScreen(page, width);
        }

        // The change-password dialog opens inside the screen.
        await page.getByRole('button', { name: locale === 'en' ? 'Change Password' : 'تغيير كلمة المرور' }).click();
        await expectInsideScreen(page, page.getByRole('dialog'), width);
      });
    }

    test('staff header keeps the menu button, and the branch list opens inside the screen', async ({ page }) => {
      await logIn(page, 'en', state.adminPhone, state.adminPassword, 'dashboard');

      const menu = page.getByRole('button', { name: 'Open menu' });
      await expectInsideScreen(page, menu, width);

      await page.getByTestId('branch-switcher').click();
      const list = page.getByTestId('branch-menu');
      await expect(list).toContainText('Second Branch');
      await expectInsideScreen(page, list, width);
      await page.getByTestId('branch-switcher').click();

      await menu.click();
      await expect(page.getByRole('link', { name: 'Trainees' })).toBeVisible();
    });

    test('"Record payment" stays inside the subscription card and opens the dialog', async ({ page }) => {
      await logIn(page, 'en', state.adminPhone, state.adminPassword, 'dashboard');
      await page.goto(`/en/trainees/${state.expiring.traineeId}`);

      const button = page.getByTestId('record-payment');
      await button.scrollIntoViewIfNeeded();
      await expectInsideScreen(page, button, width);
      await button.click();
      await expect(page.getByText('Outstanding balance')).toBeVisible();
      await expectFitsScreen(page, width);
    });
  });
}
