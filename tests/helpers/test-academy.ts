/**
 * Test fixture — a disposable academy for integration tests.
 *
 * Provisions a real academy (its own PostgreSQL schema, a branch, an admin),
 * seeds the minimum a subscription flow needs — a plan, a level, a captain —
 * and tears it all down afterwards.
 *
 * Two properties matter more than convenience:
 *
 *   1. **It can only destroy what it created.** Every academy it provisions gets
 *      a `test-` slug, and `destroyTestAcademy` refuses any schema that does not
 *      carry the matching `tenant_test_` prefix. A test suite run against the
 *      wrong database must not be able to drop a real academy by accident.
 *
 *   2. **Teardown reports failure instead of swallowing it.** Every cleanup step
 *      is attempted even if an earlier one fails, and anything that failed is
 *      rethrown at the end. The integration test this replaces wrapped each step
 *      in `catch {}`, which is how two academies silently leaked into the live
 *      database.
 */

import { randomUUID } from 'node:crypto';
import { createTenant } from '@/services/tenant.service';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { dropTenantSchema } from '@/lib/db/migration-runner';
import { hashPassword } from '@/lib/auth/password';

/** Only schemas with this prefix may ever be dropped by test teardown. */
const TEST_SCHEMA_PREFIX = 'tenant_test_';

export interface TestAcademy {
  tenantId: string;
  schemaName: string;
  branchId: string;
  adminId: string;
  planId: string;
  levelId: string;
  captainId: string;
}

/** A short random suffix so parallel test files never collide. */
function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
}

/**
 * Provision a disposable academy.
 *
 * @param label  Short lowercase tag identifying the test file, for debugging a
 *               leak if teardown ever does fail (e.g. "ledger").
 */
export async function provisionTestAcademy(label: string): Promise<TestAcademy> {
  if (!/^[a-z0-9]+$/.test(label)) {
    throw new Error(`test academy label must be lowercase alphanumeric, got "${label}"`);
  }

  const suffix = uniqueSuffix();
  const phoneBase = String(Date.now()).slice(-8);

  const { tenant } = await createTenant({
    name: `Test Academy ${label} ${suffix}`,
    slug: `test-${label}-${suffix}`,
    themeKey: 'swimming',
    contactName: 'Test',
    contactPhone: `+2010${phoneBase}`,
    contactEmail: `${label}-${suffix}@test.invalid`,
    adminName: 'Test Admin',
    adminPhone: `+2011${phoneBase}`,
    branchName: 'Main',
    branchCode: `M${suffix}`.slice(0, 20).toUpperCase(),
    branchTimezone: 'Africa/Cairo',
  });

  const seeded = await withTenantContext(tenant.id, async (tx) => {
    const branch = await tx.branch.findFirstOrThrow({ select: { id: true } });
    const admin = await tx.user.findFirstOrThrow({
      where: { role: 'ADMIN' },
      select: { id: true },
    });

    const captainUser = await tx.user.create({
      data: {
        branchId: branch.id,
        name: 'Test Captain',
        phoneNumber: `+2012${phoneBase}`,
        passwordHash: await hashPassword('Test-Password-123!'),
        role: 'CAPTAIN',
      },
    });
    const captain = await tx.captainProfile.create({
      data: { userId: captainUser.id, branchId: branch.id, payrollType: 'HOURS', attendingDays: [] },
    });

    const plan = await tx.subscriptionPlan.create({
      data: {
        branchId: branch.id,
        name: 'Test Monthly',
        minSessions: 8,
        periodType: 'FROM_SUBSCRIPTION_DATE',
        periodDays: 30,
        freezeSessions: 2,
        freezeRetakeDays: 14,
        amount: 500,
        isActive: true,
      },
    });
    const level = await tx.subscriptionPlanLevel.create({
      data: { planId: plan.id, name: 'Level 1', sortOrder: 0 },
    });

    return {
      branchId: branch.id,
      adminId: admin.id,
      planId: plan.id,
      levelId: level.id,
      captainId: captain.id,
    };
  });

  return { tenantId: tenant.id, schemaName: tenant.schemaName, ...seeded };
}

/** Create a group on the academy's plan. */
export async function createTestGroup(
  academy: TestAcademy,
  opts: { maxTrainees?: number; name?: string } = {}
): Promise<{ id: string }> {
  return withTenantContext(academy.tenantId, (tx) =>
    tx.group.create({
      data: {
        branchId: academy.branchId,
        captainId: academy.captainId,
        planId: academy.planId,
        name: opts.name ?? `Group ${uniqueSuffix()}`,
        minTrainees: 1,
        maxTrainees: opts.maxTrainees ?? 100,
        daysPerWeek: 2,
        scheduleDays: ['MONDAY', 'WEDNESDAY'],
        startTime: '17:00',
        sessionDuration: 60,
        isActive: true,
      },
      select: { id: true },
    })
  );
}

let traineeCounter = 0;

/**
 * Create a trainee (and the guardian account that owns it).
 *
 * The counter is captured synchronously, before any await, so concurrent calls
 * cannot observe each other's increment — an easy bug to write, and one that
 * produces duplicate phone numbers that look like an application defect.
 */
export async function createTestTrainee(academy: TestAcademy): Promise<{ id: string }> {
  const n = ++traineeCounter;
  const suffix = uniqueSuffix();

  return withTenantContext(academy.tenantId, async (tx) => {
    const account = await tx.user.create({
      data: {
        branchId: academy.branchId,
        name: `Guardian ${n}`,
        phoneNumber: `+2013${String(Date.now()).slice(-6)}${String(n).padStart(3, '0')}`,
        passwordHash: await hashPassword('Test-Password-123!'),
        role: 'TRAINEE',
      },
    });
    return tx.traineeProfile.create({
      data: {
        userId: account.id,
        branchId: academy.branchId,
        name: `Trainee ${n}`,
        systemCode: `T-${suffix}-${n}`,
        dateOfBirth: new Date('2015-01-01'),
        whatsappNumber: '0',
        parentIdCard: '0',
        medicalCondition: 'none',
      },
      select: { id: true },
    });
  });
}

/**
 * Tear down a test academy completely.
 *
 * Refuses anything that is not a test schema. Attempts every step even if one
 * fails, then throws if any did — so a leak is a visible test failure, not a
 * silent accumulation in whatever database the suite happened to run against.
 */
export async function destroyTestAcademy(academy: TestAcademy | null): Promise<void> {
  if (!academy) return;

  if (!academy.schemaName.startsWith(TEST_SCHEMA_PREFIX)) {
    throw new Error(
      `Refusing to drop "${academy.schemaName}": test teardown only drops schemas ` +
        `prefixed "${TEST_SCHEMA_PREFIX}".`
    );
  }

  const failures: string[] = [];
  const attempt = async (step: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      failures.push(`${step}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // DDL goes over the DIRECT connection. The old teardown used the pooled URL,
  // i.e. DROP SCHEMA through PgBouncer — one reason it failed silently.
  const directUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;

  await attempt('drop schema', () =>
    dropTenantSchema(academy.schemaName.slice('tenant_'.length), directUrl)
  );
  await attempt('delete phone index', () =>
    platformPrisma.userPhoneIndex.deleteMany({ where: { tenantId: academy.tenantId } })
  );
  await attempt('delete tenant config', () =>
    platformPrisma.tenantConfig.deleteMany({ where: { tenantId: academy.tenantId } })
  );
  await attempt('delete tenant', () =>
    platformPrisma.tenant.deleteMany({ where: { id: academy.tenantId } })
  );

  if (failures.length > 0) {
    throw new Error(
      `Test academy teardown incomplete for ${academy.schemaName} — it may have leaked:\n  ` +
        failures.join('\n  ')
    );
  }
}
