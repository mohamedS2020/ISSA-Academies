/**
 * The Super Admin usage view on a half-set-up academy — hardening plan §37.
 *
 * An ACTIVE academy whose schema is empty (provisioning died part-way, and its
 * cleanup failed too) made GET /api/superadmin/tenants/[id]/usage return 500:
 * `relation "users" does not exist`, reported by Sentry from a real test leak.
 * It is meant to show zeros. This recreates that academy and asks for its usage.
 */

import { randomUUID } from 'node:crypto';
import { describe, test, expect, afterAll } from '@jest/globals';
import { PrismaClient } from '@/generated/platform-client';
import { getTenantUsageStats } from '@/services/tenant.service';
import { platformPrisma } from '@/lib/db/platform-client';
import { destroyTestAcademy, type TestAcademy } from '../helpers/test-academy';

const created: TestAcademy[] = [];

afterAll(async () => {
  try {
    for (const academy of created) await destroyTestAcademy(academy);
  } finally {
    await platformPrisma.$disconnect();
  }
});

/** A platform record for an academy whose schema is empty, or absent. */
async function halfSetUpAcademy(withSchema: boolean): Promise<string> {
  const suffix = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const schemaName = `tenant_test_usage_${suffix}`;
  const tenant = await platformPrisma.tenant.create({
    data: {
      name: `Test Academy usage ${suffix}`,
      slug: `test-usage-${suffix}`,
      schemaName,
      status: 'ACTIVE',
    },
  });
  created.push({ tenantId: tenant.id, schemaName } as TestAcademy);

  if (withSchema) {
    // DDL over the direct connection, like provisioning.
    const direct = new PrismaClient({
      datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL! } },
    });
    try {
      await direct.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    } finally {
      await direct.$disconnect();
    }
  }
  return tenant.id;
}

const ZEROS = {
  activeUsers: 0,
  totalTrainees: 0,
  activeSubscriptions: 0,
  totalBranches: 0,
  totalGroups: 0,
};

describe('getTenantUsageStats on a half-set-up academy', () => {
  test('an empty schema shows zeros instead of failing', async () => {
    const tenantId = await halfSetUpAcademy(true);
    await expect(getTenantUsageStats(tenantId)).resolves.toEqual({ tenantId, ...ZEROS });
  }, 60_000);

  test('a missing schema shows zeros instead of failing', async () => {
    const tenantId = await halfSetUpAcademy(false);
    await expect(getTenantUsageStats(tenantId)).resolves.toEqual({ tenantId, ...ZEROS });
  }, 60_000);
});
