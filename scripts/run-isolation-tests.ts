/**
 * ISSA — Isolation Test Orchestrator
 *
 * tests/isolation/*.test.ts read tenant/branch IDs from env vars
 * (TEST_TENANT_A_ID, TEST_BRANCH_B_ID, etc.) and fall back to placeholder
 * IDs that don't exist — meaning if nothing provisions real tenants first,
 * those tests just `console.warn` and pass vacuously without testing
 * anything.
 *
 * This script provisions two REAL tenants (and a second branch + fixture
 * data inside Tenant A) before running the isolation suite, injects their
 * real IDs as env vars, then tears everything down afterward — so the
 * tests actually exercise cross-tenant and cross-branch isolation instead
 * of silently skipping.
 *
 * Used by `npm run test:isolation` and the CI workflow.
 */

import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { addDays } from 'date-fns';
import { createTenant } from '../src/services/tenant.service';
import { platformPrisma } from '../src/lib/db/platform-client';
import { withTenantContext } from '../src/lib/db/tenant-client';
import { dropTenantSchema } from '../src/lib/db/migration-runner';
import { hashPassword } from '../src/lib/auth/password';

interface ProvisionedTenant {
  tenantId: string;
  slug: string;
  defaultBranchId: string;
}

async function provisionTenant(
  label: 'A' | 'B',
  suffix: string
): Promise<ProvisionedTenant> {
  const slug = `iso-${label.toLowerCase()}-${suffix}`;
  const branchCode = `B${label}${suffix}`.slice(0, 20);

  const result = await createTenant({
    name: `Isolation Test Tenant ${label} ${suffix}`,
    slug,
    contactName: 'Isolation Test',
    contactPhone: `+2010000000${label === 'A' ? '1' : '2'}`,
    contactEmail: `tenant-${label.toLowerCase()}@isolation-test.local`,
    adminName: `Admin ${label}`,
    adminPhone: `+2010${suffix}${label === 'A' ? '1' : '2'}`,
    branchName: `Branch ${label}`,
    branchCode,
    branchTimezone: 'Africa/Cairo',
  });

  const defaultBranchId = await withTenantContext(result.tenant.id, async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { code: branchCode },
      select: { id: true },
    });
    if (!branch) throw new Error(`Default branch not found for tenant ${label}`);
    return branch.id;
  });

  return { tenantId: result.tenant.id, slug, defaultBranchId };
}

/**
 * Creates a second branch inside Tenant A plus a user, trainee, and
 * receipt scoped to it — so branch-isolation.test.ts's three sub-tests
 * (user / trainee / financial isolation) all have real data to check
 * against, instead of skipping with "vacuous test" warnings.
 */
async function seedSecondBranch(tenantId: string, suffix: string): Promise<string> {
  const branchBId = randomUUID();
  const passwordHash = await hashPassword('Isolation-Test-Password-123!');

  await withTenantContext(tenantId, async (tx) => {
    await tx.branch.create({
      data: {
        id: branchBId,
        name: 'Branch B (second branch in Tenant A)',
        code: `BR2${suffix}`.slice(0, 20),
        timezone: 'Africa/Cairo',
        isActive: true,
      },
    });

    // User isolation fixture
    await tx.user.create({
      data: {
        branchId: branchBId,
        name: 'Branch B Moderator',
        phoneNumber: `+2011${suffix}1`,
        passwordHash,
        role: 'MODERATOR',
        isActive: true,
      },
    });

    // Trainee isolation fixture
    const traineeUser = await tx.user.create({
      data: {
        branchId: branchBId,
        name: 'Branch B Trainee',
        phoneNumber: `+2011${suffix}2`,
        passwordHash,
        role: 'TRAINEE',
        isActive: true,
      },
    });
    const trainee = await tx.traineeProfile.create({
      data: {
        userId: traineeUser.id,
        branchId: branchBId,
        name: 'Branch B Trainee',
        systemCode: `ISO-${suffix}-00001`,
        dateOfBirth: new Date('2015-01-01'),
        whatsappNumber: `+2011${suffix}2`,
        parentIdCard: '00000000000000',
        medicalCondition: 'None',
      },
    });

    // Financial (receipt) isolation fixture
    const plan = await tx.subscriptionPlan.create({
      data: {
        branchId: branchBId,
        name: 'Isolation Test Plan',
        minSessions: 10,
        periodType: 'FROM_SUBSCRIPTION_DATE',
        periodDays: 30,
        freezeSessions: 2,
        freezeRetakeDays: 14,
        amount: 100,
        isActive: true,
      },
    });
    const level = await tx.subscriptionPlanLevel.create({
      data: { planId: plan.id, name: 'Level 1', sortOrder: 0 },
    });
    const subscription = await tx.traineeSubscription.create({
      data: {
        traineeId: trainee.id,
        planId: plan.id,
        levelId: level.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: addDays(new Date(), 30),
        totalSessions: 10,
        amountPaid: 100,
        amountDue: 0,
        paymentStatus: 'PAID',
      },
    });
    await tx.receipt.create({
      data: {
        branchId: branchBId,
        traineeId: trainee.id,
        subscriptionId: subscription.id,
        receiptNumber: `ISO-${suffix}`,
        seq: 1,
        amount: 100,
      },
    });
  });

  return branchBId;
}

function runJest(env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    // shell: true is required on Windows to spawn npx.cmd directly —
    // without it, spawn() fails with EINVAL.
    const child = spawn('npx', ['jest', '--config=jest.isolation.config.js'], {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function teardown(tenantIds: string[]) {
  for (const tenantId of tenantIds) {
    try {
      const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) continue;
      await dropTenantSchema(tenant.schemaName.replace(/^tenant_/, ''), process.env.DATABASE_URL!);
      await platformPrisma.tenant.delete({ where: { id: tenantId } });
      console.log(`[isolation-teardown] Cleaned up tenant ${tenantId}`);
    } catch (err) {
      console.error(`[isolation-teardown] Failed to clean up tenant ${tenantId}:`, err);
    }
  }
}

async function main() {
  const suffix = Date.now().toString().slice(-8);
  const tenantIds: string[] = [];

  try {
    console.log('[isolation-setup] Provisioning Tenant A...');
    const tenantA = await provisionTenant('A', suffix);
    tenantIds.push(tenantA.tenantId);

    console.log('[isolation-setup] Provisioning Tenant B...');
    const tenantB = await provisionTenant('B', suffix);
    tenantIds.push(tenantB.tenantId);

    console.log('[isolation-setup] Seeding second branch + fixture data in Tenant A...');
    const branchBId = await seedSecondBranch(tenantA.tenantId, suffix);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TEST_TENANT_A_ID: tenantA.tenantId,
      TEST_TENANT_A_ADMIN_ID: randomUUID(), // only used for unverified JWT claim checks
      TEST_TENANT_A_BRANCH_ID: tenantA.defaultBranchId,
      TEST_TENANT_B_ID: tenantB.tenantId,
      TEST_TENANT_B_ADMIN_ID: randomUUID(),
      TEST_TENANT_B_BRANCH_ID: tenantB.defaultBranchId,
      TEST_BRANCH_A_ID: tenantA.defaultBranchId,
      TEST_BRANCH_B_ID: branchBId,
    };

    console.log('[isolation-setup] Running isolation test suite...\n');
    const exitCode = await runJest(env);

    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } finally {
    console.log('\n[isolation-teardown] Cleaning up test tenants...');
    await teardown(tenantIds);
    await platformPrisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[isolation-setup] Fatal error:', err);
  process.exitCode = 1;
});
