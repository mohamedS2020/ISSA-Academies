/**
 * The academy data import, as the super admin uses it: download the template,
 * upload a file with a mistake and get it back marked, upload the corrected
 * one, import, and hand a parent the login that then opens their portal.
 *
 * Imports into the e2e academy's empty "Second Branch".
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { readState } from './fixture';
import { filledTemplate, freshSample } from '@/lib/import/test-workbook';

const state = readState();

async function logIn(page: Page, phone: string, password: string, lands: string) {
  await page.goto('/en/login');
  await page.locator('#login-phone').fill(phone);
  await page.locator('#login-password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**/en/${lands}`);
}

const xlsx = (name: string, buffer: Buffer) => ({
  name,
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer,
});

test('import an academy from Excel, then sign in with an imported login', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await logIn(page, state.superAdmin.phone, state.superAdmin.password, 'admin');
  await page.goto(`/en/admin/${state.tenantId}`);

  // The template downloads.
  const templateDownload = page.waitForEvent('download');
  await page.getByTestId('import-template').click();
  expect((await templateDownload).suggestedFilename()).toMatch(/import-template\.xlsx$/);

  // Two branches: Main has data, so the empty Second Branch is the one offered.
  await page.getByTestId('import-open').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: /Main/ })).toBeDisabled();
  await expect(dialog.getByRole('radio', { name: /Second Branch/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Next' }).click();

  // A file with a mistake: listed, nothing saved, and the marked-up copy downloads.
  const broken = freshSample();
  broken.trainees![0].parentPhone = 'not a phone';
  await page.getByTestId('import-file').setInputFiles(xlsx('academy.xlsx', await filledTemplate(broken)));
  await page.getByTestId('import-check').click();
  await expect(page.getByTestId('import-problems')).toContainText('Trainees · row 2 · Parent phone');
  await expect(page.getByTestId('import-problems')).toContainText('Not a valid phone number');
  const marked = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download marked-up file' }).click();
  expect((await marked).suggestedFilename()).toBe('academy-to-fix.xlsx');

  // The corrected file: ready, then imported.
  await dialog.getByRole('button', { name: 'Choose another file' }).click();
  await page.getByTestId('import-file').setInputFiles(xlsx('academy.xlsx', await filledTemplate(freshSample())));
  await page.getByTestId('import-check').click();
  await expect(page.getByTestId('import-ready')).toContainText('4 trainees, 3 parent accounts');
  await expect(page.getByTestId('import-ready')).toContainText('2 current, 1 ended, 1 without');

  const credentials = page.waitForEvent('download');
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-done')).toContainText('4 trainees are in the system', { timeout: 120_000 });
  const file = await (await credentials).path();

  // The logins file: the parent of two siblings, with their password.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(file) as unknown as ArrayBuffer);
  const rows = wb.worksheets[0].getRows(3, 10)!.map((r) => ({ name: r.getCell(2).text, phone: r.getCell(3).text, password: r.getCell(4).text, trainees: r.getCell(5).text }));
  const parent = rows.find((r) => r.name === 'Ali Hassan')!;
  expect(parent.trainees).toBe('Salma Ali، Omar Ali');

  // The history line, and the branch no longer offered.
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByText('Second Branch: 4 trainees, 2 captains, 2 groups')).toBeVisible();
  await expect(page.getByTestId('import-open')).toBeDisabled();

  // The parent signs in with the imported login and sees both children.
  const parentContext = await browser.newContext();
  const parentPage = await parentContext.newPage();
  await logIn(parentPage, parent.phone, parent.password, 'portal');
  await expect(parentPage.getByRole('heading', { name: 'Welcome, Salma Ali' })).toBeVisible();
  await parentContext.close();
});
