/** Drop the academy global setup created. */

import { existsSync, unlinkSync } from 'node:fs';
import { loadEnvConfig } from '@next/env';
import { destroyTestAcademy } from '../tests/helpers/test-academy';
import { platformPrisma } from '@/lib/db/platform-client';
import { STATE_FILE, readState } from './fixture';

export default async function globalTeardown(): Promise<void> {
  loadEnvConfig(process.cwd());
  if (!existsSync(STATE_FILE)) return;
  const state = readState();
  try {
    await destroyTestAcademy({
      tenantId: state.tenantId,
      schemaName: state.schemaName,
      branchId: '',
      adminId: '',
      planId: '',
      levelId: '',
      captainId: '',
    });
  } finally {
    unlinkSync(STATE_FILE);
    await platformPrisma.$disconnect();
  }
}
