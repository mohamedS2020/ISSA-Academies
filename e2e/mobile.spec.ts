/**
 * Phones: the screens that used to break on a phone stay usable.
 *
 *   - The parent portal fits the screen (it used to grow to ~505 px: the
 *     header did not wrap, its page links got 0 px and logout sat off-screen),
 *     and its bottom tab bar navigates.
 *   - The staff header keeps its menu button at 320 px.
 *   - The branch switcher opens inside the screen.
 *   - "Record payment" stays inside the trainee's subscription card.
 *   - Lists are cards with their actions on screen (no sideways table).
 *   - Attendance: labelled 44 px buttons, the submit bar on screen.
 *   - The schedule shows one day at a time.
 *   - Form fields are 16 px (iOS zooms into smaller ones), and the page
 *     itself scrolls (not a box inside it).
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

    test('lists are cards with their actions on screen, and the page itself scrolls', async ({ page }) => {
      await logIn(page, 'en', state.adminPhone, state.adminPassword, 'dashboard');
      await page.goto('/en/trainees');

      const cards = page.getByTestId('data-cards');
      await expect(cards).toBeVisible();
      await expect(page.locator('table')).toBeHidden();
      const card = cards.getByRole('listitem').filter({ hasText: state.expiring.name });
      await expect(card).toBeVisible();
      const view = card.getByRole('button', { name: 'View' });
      await expectInsideScreen(page, view, width);
      expect((await view.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectFitsScreen(page, width);

      // Fields are 16 px: iOS zooms into anything smaller on focus.
      const search = page.getByPlaceholder(/search/i).first();
      expect(await search.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

      // The document scrolls, so the browser bar can hide and a tap on the
      // status bar returns to the top: no box around the page content scrolls
      // on its own, and a long page (a trainee's) scrolls the window.
      await page.goto(`/en/trainees/${state.expiring.traineeId}`);
      await expect(page.getByTestId('record-payment')).toBeVisible();
      const scrollBoxes = await page.locator('main').evaluate((main) => {
        const boxes: string[] = [];
        for (let el: Element | null = main; el && el !== document.body; el = el.parentElement) {
          const oy = getComputedStyle(el).overflowY;
          if (oy === 'auto' || oy === 'scroll') boxes.push(el.tagName);
        }
        return boxes;
      });
      expect(scrollBoxes).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 400));
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });

    test('attendance has labelled 44 px buttons and the submit bar on screen', async ({ page }) => {
      await logIn(page, 'en', state.adminPhone, state.adminPassword, 'dashboard');
      await page.goto('/en/attendance');
      const picker = page.locator('#attendance-session');
      await expect(picker.locator('option')).toHaveCount(2); // the placeholder + today's session
      await picker.selectOption({ index: 1 });

      const row = page.getByRole('group', { name: state.expiring.name });
      for (const label of ['Present', 'Absent', 'Excused']) {
        const button = row.getByRole('button', { name: label });
        await expect(button).toBeVisible();
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await expectInsideScreen(page, button, width);
      }
      await row.getByRole('button', { name: 'Absent' }).click();
      await expect(row.getByRole('button', { name: 'Absent' })).toHaveAttribute('aria-pressed', 'true');

      // The submit bar sticks to the bottom of the screen; nothing is submitted.
      const submit = page.getByRole('button', { name: /submit attendance/i });
      await expect(submit).toBeInViewport();
    });

    test('the schedule shows one day at a time', async ({ page }) => {
      await logIn(page, 'en', state.adminPhone, state.adminPassword, 'dashboard');
      await page.goto('/en/schedule');
      const dayView = page.getByTestId('schedule-day-view');
      await expect(dayView).toBeVisible();
      await expect(dayView.getByRole('tab')).toHaveCount(7);
      // Today is selected and shows today's session with its group's full name.
      await expect(dayView.getByRole('tab', { selected: true })).toBeVisible();
      await expect(dayView.getByRole('tabpanel')).toContainText('Dolphins');
      await expectFitsScreen(page, width);
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
