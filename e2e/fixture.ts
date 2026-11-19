/**
 * What global setup creates and the specs use, kept in a file between the two
 * (Playwright runs them in separate processes).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STATE_FILE = join(__dirname, '.e2e-state.json');

export interface E2EState {
  tenantId: string;
  schemaName: string;
  adminPhone: string;
  adminPassword: string;
  /** Subscription ends in 3 days: on the dashboard's "Expiring soon" list. */
  expiring: { traineeId: string; name: string; guardianPhone: string; guardianPassword: string };
  /** Subscription has ended: renewing starts today. */
  ended: { traineeId: string; name: string };
  /** A platform super admin, removed by teardown (import.spec.ts). */
  superAdmin: { id: string; phone: string; password: string };
}

export function readState(): E2EState {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as E2EState;
}
