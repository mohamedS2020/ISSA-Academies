/**
 * Numbers in the academy's formats: money in its currency without stray
 * decimals, and times of day in the branch's 12- or 24-hour choice.
 */
import { test, expect, type Page } from '@playwright/test';
import { readState } from './fixture';

const state = readState();

async function logIn(page: Page, locale: string) {
  await page.goto(`/${locale}/login`);
  await page.locator('#login-phone').fill(state.adminPhone);
  await page.locator('#login-password').fill(state.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**/${locale}/dashboard`);
}

test('money reads in the academy currency, both languages', async ({ page }) => {
  await logIn(page, 'en');
  await page.goto(`/en/trainees/${state.expiring.traineeId}`);
  // Part paid: 200 of 500 still due (global-setup).
  await expect(page.locator('main').getByText('EGP 200', { exact: true }).locator('visible=true').first()).toBeVisible();
  await page.goto('/en/subscriptions');
  await expect(page.locator('main').getByText('EGP 500', { exact: true }).locator('visible=true').first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText('500.00');

  await page.goto(`/ar/trainees/${state.expiring.traineeId}`);
  await expect(page.locator('main').getByText('200 ج.م', { exact: true }).locator('visible=true').first()).toBeVisible();
});

test("a branch's time format: 12-hour by default, 24-hour once the admin picks it", async ({ page }) => {
  await logIn(page, 'en');
  // The e2e group starts at 17:00 (tests/helpers/test-academy.ts createTestGroup).
  await page.goto('/en/groups');
  // The group card's time, not the Hour filter's options (they follow the format too).
  const groupTime = () => page.locator('main td, main li').getByText(/(5:00\sPM|17:00) ·/).locator('visible=true').first();
  await expect(groupTime()).toHaveText(/5:00\sPM/);
  await expect(page.locator('main select option[value="17"]')).toHaveText(/5:00\sPM/);

  // Switch the branch to 24-hour.
  await page.goto('/en/branches');
  await page.locator('main').getByRole('button', { name: /edit/i }).first().click();
  await page.locator('#dashboard-branches-time-format').selectOption('24h');
  await page.getByRole('button', { name: /save/i }).last().click();
  await expect(page.locator('#dashboard-branches-time-format')).toHaveCount(0);

  await page.goto('/en/groups');
  await expect(groupTime()).toHaveText(/17:00/);

  // Back to 12-hour for the other specs.
  await page.goto('/en/branches');
  await page.locator('main').getByRole('button', { name: /edit/i }).first().click();
  await page.locator('#dashboard-branches-time-format').selectOption('12h');
  await page.getByRole('button', { name: /save/i }).last().click();
  await expect(page.locator('#dashboard-branches-time-format')).toHaveCount(0);
});
