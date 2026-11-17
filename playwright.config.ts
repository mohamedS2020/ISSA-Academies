/**
 * Playwright end-to-end tests (e2e/).
 *
 *   npm run test:e2e
 *
 * Needs the same database as the integration tests (DATABASE_URL, platform
 * migrations applied). Global setup provisions a disposable test academy with
 * the data each spec needs; global teardown drops it.
 *
 * The app is started by Playwright: `next dev` by default; CI sets
 * E2E_SERVER_COMMAND to serve the production build it has just made.
 */

import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // The specs share one academy and change its data: run them in order.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: process.env.E2E_SERVER_COMMAND ?? `npx next dev -p ${PORT}`,
    url: `${baseURL}/en/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { RUN_SCHEDULER: 'false' },
  },
});
