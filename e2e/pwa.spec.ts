/**
 * The installable app: manifest, iOS tags, offline page, and the service
 * worker serving that page when the phone has no connection.
 *
 * The worker registers only in production builds (next start, as in CI); on
 * `next dev` the offline test is skipped, the rest still runs.
 */
import { test, expect } from '@playwright/test';
import { readState } from './fixture';

const state = readState();

test('the manifest is in the page language and its icons load', async ({ page, request }) => {
  for (const [locale, name, dir] of [['ar', 'يلّا أكاديمي', 'rtl'], ['en', 'Yallacademy', 'ltr']] as const) {
    await page.goto(`/${locale}/login`);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe(`/app.webmanifest?locale=${locale}`);

    const res = await request.get(href!);
    expect(res.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await res.json();
    expect(manifest).toMatchObject({ name, lang: locale, dir, start_url: `/${locale}/login`, display: 'standalone' });
    for (const icon of manifest.icons) {
      const img = await request.get(icon.src);
      expect(img.status(), icon.src).toBe(200);
      expect(img.headers()['content-type']).toBe('image/png');
    }

    // iOS reads its own tags, not the manifest.
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]')).toHaveCount(1);
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', name);
    expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toContain('apple-touch-icon.png');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  }
});

test('opening the app signed in skips the login form', async ({ page }) => {
  await page.goto('/en/login');
  await page.locator('#login-phone').fill(state.adminPhone);
  await page.locator('#login-password').fill(state.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/en/dashboard');

  // The manifest's start_url.
  await page.goto('/en/login');
  await page.waitForURL('**/en/dashboard');
});

test('offline, a page shows the offline screen instead of the browser error', async ({ page, context }) => {
  await page.goto('/ar/login');
  const registered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const ready = navigator.serviceWorker.ready.then(() => true);
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000));
    return Promise.race([ready, timeout]);
  });
  test.skip(!registered, 'The service worker registers only in production builds (next start).');

  // The worker controls pages loaded after it activated.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // Offline. Chromium's offline switch doesn't reach a service worker's own
  // requests, so the page loads (the worker fetches it) are failed as well.
  // Routing them needs PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS (playwright.config.ts).
  await context.setOffline(true);
  await context.route('**/*', (route) =>
    route.request().resourceType() === 'document' ? route.abort('internetdisconnected') : route.continue()
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'أنت غير متصل بالإنترنت' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
  // The symbol comes from the worker's cache too (a broken image has no width).
  await expect.poll(() => page.locator('img.mark:visible').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await expect(page.getByRole('button', { name: /حاول مرة أخرى/ })).toBeVisible();

  // Back online, the page reloads itself (the "online" event) or on the button.
  await context.unrouteAll();
  await context.setOffline(false);
  await expect(async () => {
    const retry = page.getByRole('button', { name: /حاول مرة أخرى/ });
    if (await retry.isVisible()) await retry.click();
    await expect(page.locator('#login-phone')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
});
