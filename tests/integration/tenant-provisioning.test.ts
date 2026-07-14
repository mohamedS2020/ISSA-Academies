/**
 * ISSA — Tenant Provisioning Integration Test
 *
 * Tests the full tenant provisioning lifecycle:
 *   1. Create a tenant via the service
 *   2. Verify schema and tables exist
 *   3. Verify default admin can authenticate
 *   4. Suspend → Reactivate transitions
 *   5. Delete tenant
 *   6. Cleanup
 *
 * ⚠️ Requires a live PostgreSQL database with migrations applied.
 *    Run with: npx jest tests/integration/tenant-provisioning.test.ts
 */

import { describe, test, expect, afterAll } from '@jest/globals';
import {
  createTenant,
  getTenantById,
  changeTenantStatus,
  getTenantUsageStats,
  listTenants,
} from '@/services/tenant.service';
import { isValidStatusTransition } from '@/schemas/tenant.schema';
import { platformPrisma } from '@/lib/db/platform-client';
import { dropTenantSchema } from '@/lib/db/migration-runner';
import { comparePassword } from '@/lib/auth/password';
import { withTenantContext } from '@/lib/db/tenant-client';

// ─── Test Configuration ─────────────────────────────────────

const TEST_TENANT_SLUG = 'integration-test-' + Date.now();
let testTenantId: string | null = null;
let testAdminPassword: string | null = null;

// ─── Cleanup ────────────────────────────────────────────────

afterAll(async () => {
  // Clean up: drop test tenant schema and records
  if (testTenantId) {
    try {
      await dropTenantSchema(
        TEST_TENANT_SLUG.replace(/-/g, '_'),
        process.env.DATABASE_URL!
      );
    } catch {
      // Schema might already be dropped
    }

    try {
      // Delete phone index entries
      await platformPrisma.userPhoneIndex.deleteMany({
        where: { tenantId: testTenantId },
      });
      // Delete tenant config
      await platformPrisma.tenantConfig.deleteMany({
        where: { tenantId: testTenantId },
      });
      // Delete tenant record
      await platformPrisma.tenant.delete({
        where: { id: testTenantId },
      });
    } catch {
      // Records might already be cleaned up
    }
  }

  await platformPrisma.$disconnect();
});

// ─── Tests ──────────────────────────────────────────────────

describe('Tenant Provisioning Flow', () => {
  test('validates status transitions correctly', () => {
    // Valid transitions
    expect(isValidStatusTransition('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(isValidStatusTransition('SUSPENDED', 'ACTIVE')).toBe(true);
    expect(isValidStatusTransition('ACTIVE', 'DELETED')).toBe(true);
    expect(isValidStatusTransition('SUSPENDED', 'DELETED')).toBe(true);

    // Invalid transitions
    expect(isValidStatusTransition('DELETED', 'ACTIVE')).toBe(false);
    expect(isValidStatusTransition('DELETED', 'SUSPENDED')).toBe(false);
    expect(isValidStatusTransition('ACTIVE', 'ACTIVE')).toBe(false); // Same status
  });

  test('creates a tenant with full provisioning', async () => {
    const result = await createTenant({
      name: 'Integration Test Academy',
      slug: TEST_TENANT_SLUG,
      contactName: 'Test Contact',
      contactPhone: '+201999999999',
      contactEmail: 'test@integration.test',
      adminName: 'Test Admin',
      adminPhone: '+201888888888',
      branchName: 'Test Branch',
      branchCode: 'TEST',
      branchTimezone: 'Africa/Cairo',
    });

    testTenantId = result.tenant.id;
    testAdminPassword = result.adminCredentials.password;

    // Verify tenant record
    expect(result.tenant.name).toBe('Integration Test Academy');
    expect(result.tenant.slug).toBe(TEST_TENANT_SLUG);
    expect(result.tenant.status).toBe('ACTIVE');
    expect(result.tenant.schemaName).toContain('tenant_');

    // Verify admin credentials returned
    expect(result.adminCredentials.name).toBe('Test Admin');
    expect(result.adminCredentials.phoneNumber).toBe('+201888888888');
    expect(result.adminCredentials.password).toBeTruthy();
    expect(result.adminCredentials.password.length).toBeGreaterThanOrEqual(12);

    // Verify branch info returned
    expect(result.branch.name).toBe('Test Branch');
    expect(result.branch.code).toBe('TEST');
    expect(result.branch.timezone).toBe('Africa/Cairo');
  }, 30000); // 30s timeout for schema creation + migrations

  test('can retrieve the created tenant', async () => {
    expect(testTenantId).toBeTruthy();
    const tenant = await getTenantById(testTenantId!);

    expect(tenant).toBeTruthy();
    expect(tenant!.name).toBe('Integration Test Academy');
    expect(tenant!.config).toBeTruthy();
    expect(tenant!.config!.currency).toBe('EGP');
    expect(tenant!.config!.defaultTimezone).toBe('Africa/Cairo');
  });

  test('tenant appears in list', async () => {
    const result = await listTenants({ search: TEST_TENANT_SLUG });
    expect(result.tenants.length).toBeGreaterThanOrEqual(1);
    expect(result.tenants.some((t: { slug: string }) => t.slug === TEST_TENANT_SLUG)).toBe(true);
  });

  test('verifies tables exist in tenant schema', async () => {
    expect(testTenantId).toBeTruthy();

    await withTenantContext(testTenantId!, async (tx) => {
      // Query for tables in the schema — these should exist after migrations
      const users = await tx.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) as count FROM "users"`
      );
      expect(Number(users[0].count)).toBeGreaterThanOrEqual(1); // At least the admin

      const branches = await tx.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) as count FROM "branches"`
      );
      expect(Number(branches[0].count)).toBeGreaterThanOrEqual(1); // Default branch
    });
  }, 10000);

  test('default admin password can be verified', async () => {
    expect(testTenantId).toBeTruthy();
    expect(testAdminPassword).toBeTruthy();

    await withTenantContext(testTenantId!, async (tx) => {
      const admin = await tx.$queryRawUnsafe<
        { password_hash: string }[]
      >(
        `SELECT "password_hash" FROM "users" WHERE "phone_number" = '+201888888888' LIMIT 1`
      );

      expect(admin.length).toBe(1);
      const isMatch = await comparePassword(testAdminPassword!, admin[0].password_hash);
      expect(isMatch).toBe(true);
    });
  }, 10000);

  test('phone index entry exists in platform DB', async () => {
    const index = await platformPrisma.userPhoneIndex.findFirst({
      where: {
        phoneNumber: '+201888888888',
        tenantId: testTenantId!,
      },
    });

    expect(index).toBeTruthy();
    expect(index!.role).toBe('ADMIN');
  });

  test('returns usage stats for tenant', async () => {
    expect(testTenantId).toBeTruthy();
    const stats = await getTenantUsageStats(testTenantId!);

    expect(stats.tenantId).toBe(testTenantId);
    expect(stats.activeUsers).toBeGreaterThanOrEqual(1);
    expect(stats.totalBranches).toBeGreaterThanOrEqual(1);
  }, 10000);

  test('can suspend and reactivate tenant', async () => {
    expect(testTenantId).toBeTruthy();

    // Suspend
    const suspended = await changeTenantStatus(testTenantId!, 'SUSPENDED');
    expect(suspended.status).toBe('SUSPENDED');

    // Reactivate
    const reactivated = await changeTenantStatus(testTenantId!, 'ACTIVE');
    expect(reactivated.status).toBe('ACTIVE');
  });

  test('rejects invalid status transitions', async () => {
    expect(testTenantId).toBeTruthy();

    // Mark as deleted
    await changeTenantStatus(testTenantId!, 'DELETED');

    // Try to reactivate — should fail
    await expect(
      changeTenantStatus(testTenantId!, 'ACTIVE')
    ).rejects.toThrow('Invalid status transition');
  });
});
