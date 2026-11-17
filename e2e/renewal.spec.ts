/**
 * Renewal, end to end: from the dashboard's "Expiring soon" list to a queued
 * renewal on the trainee's page, and back to "Renewed" on the dashboard; and
 * renewing an ended subscription from the trainee page, in Arabic.
 */

import { test, expect, type Page } from '@playwright/test';
import { readState } from './fixture';

const state = readState();

async function logIn(page: Page, locale: 'en' | 'ar') {
  await page.goto(`/${locale}/login`);
  await page.locator('#login-phone').fill(state.adminPhone);
  await page.locator('#login-password').fill(state.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**/${locale}/dashboard`);
}

test('dashboard Renew opens the trainee page with the renew dialog, and queues the renewal', async ({ page }) => {
  await logIn(page, 'en');

  // The expiring trainee is listed with a Renew link to their page.
  const row = page.locator('tr', { hasText: state.expiring.name });
  await expect(row).toBeVisible();
  await row.getByTestId('expiring-renew').click();

  await expect(page).toHaveURL(new RegExp(`/en/trainees/${state.expiring.traineeId}\\?renew=1$`));
  const dialog = page.getByTestId('renew-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Renew subscription' })).toBeVisible();

  // Prefilled from the current subscription; queued after it.
  await expect(dialog.getByTestId('renew-summary')).toContainText('Test Monthly');
  await expect(dialog.getByTestId('renew-summary')).toContainText('Level 1');
  await expect(dialog.getByTestId('renew-summary')).toContainText('Dolphins');
  await expect(dialog.getByTestId('renew-price')).toContainText('500');
  await expect(dialog.getByTestId('renew-when')).toContainText('Starts automatically on');
  await expect(dialog.getByLabel('Paid now')).toHaveValue('500');

  // Paying needs a method.
  await dialog.getByRole('button', { name: /Renew and record/ }).click();
  await expect(dialog.getByRole('alert')).toContainText('Choose how it was paid');
  await dialog.getByLabel('Payment method').selectOption('CASH');

  // The change-details pickers are there, prefilled, and can be left as they are.
  await dialog.getByRole('button', { name: 'Change plan, level or group' }).click();
  await expect(dialog.getByLabel('Level')).toHaveValue(/.+/);

  await dialog.getByRole('button', { name: /Renew and record/ }).click();

  const done = dialog.getByTestId('renew-done');
  await expect(done).toContainText('Renewal queued');
  await expect(done.locator('.font-mono')).toHaveText(/\S+/); // the receipt number
  await done.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  // The page now shows the queued renewal, and no second Renew.
  const upcoming = page.getByTestId('upcoming-subscription');
  await expect(upcoming).toContainText('Next subscription (queued)');
  await expect(upcoming).toContainText('Test Monthly');
  await expect(page.getByTestId('renew-button')).toHaveCount(0);
  await expect(page.getByTestId('renewal-banner')).toHaveCount(0);
  // ?renew=1 has left the address, so a reload does not reopen the dialog.
  await expect(page).toHaveURL(new RegExp(`/en/trainees/${state.expiring.traineeId}$`));

  // Back on the dashboard, the trainee is marked as renewed.
  await page.goto('/en/dashboard');
  await expect(
    page.locator('tr', { hasText: state.expiring.name }).getByTestId('expiring-renewed')
  ).toBeVisible();
});

test('an ended subscription: the banner offers Renew, and it starts today (Arabic)', async ({ page }) => {
  await logIn(page, 'ar');
  await page.goto(`/ar/trainees/${state.ended.traineeId}`);

  const banner = page.getByTestId('renewal-banner');
  await expect(banner).toContainText('انتهى الاشتراك');
  await banner.getByRole('button', { name: 'تجديد' }).click();

  const dialog = page.getByTestId('renew-dialog');
  await expect(dialog.getByRole('heading', { name: 'تجديد الاشتراك' })).toBeVisible();
  await expect(dialog.getByTestId('renew-when')).toContainText('يبدأ اليوم');
  // Amounts read left to right, even on a right-to-left page.
  await expect(dialog.getByLabel('المدفوع الآن')).toHaveAttribute('dir', 'ltr');

  // Nothing paid now: no payment method needed, no receipt.
  await dialog.getByLabel('المدفوع الآن').fill('0');
  await dialog.getByRole('button', { name: 'تجديد', exact: true }).click();

  const done = dialog.getByTestId('renew-done');
  await expect(done).toContainText('تم تجديد الاشتراك');
  await expect(done).toContainText('لم يصدر إيصال');
  await done.getByRole('button', { name: 'تم' }).click();

  // Active again, with the full price still due.
  await expect(page.getByTestId('renewal-banner')).toHaveCount(0);
  await expect(page.getByText('500.00')).toBeVisible();
});
