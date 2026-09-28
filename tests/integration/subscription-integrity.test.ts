/**
 * Subscription integrity — hardening plan §23.
 *
 * A trainee must never hold two ACTIVE subscriptions. Before the partial unique
 * index, concurrent enrollments could both pass the application's "already
 * active?" check and both create one — two receipts, two income entries, a
 * double charge. Reproduced in 6 of 10 staggered attempts.
 *
 * The invariant test is deterministic. The race tests are necessarily
 * probabilistic — whether two requests interleave badly depends on timing — so
 * they run several staggers and assert the invariant holds in every one.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { enrollTrainee, renewSubscription } from '@/services/subscription.service';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import {
  provisionTestAcademy,
  destroyTestAcademy,
  createTestGroup,
  createTestTrainee,
  type TestAcademy,
} from '../helpers/test-academy';

let academy: TestAcademy | null = null;

beforeAll(async () => {
  academy = await provisionTestAcademy('subint');
}, 120_000);

afterAll(async () => {
  try {
    await destroyTestAcademy(academy);
  } finally {
    await platformPrisma.$disconnect();
  }
});

const input = (a: TestAcademy, traineeId: string, groupId: string) => ({
  traineeId,
  planId: a.planId,
  levelId: a.levelId,
  groupId,
  amountPaid: 500,
  paymentStatus: 'PAID' as const,
  paymentMethod: 'CASH' as const,
});

const activeCount = (a: TestAcademy, traineeId: string) =>
  withTenantContext(a.tenantId, (tx) =>
    tx.traineeSubscription.count({ where: { traineeId, status: 'ACTIVE' } })
  );

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('one active subscription per trainee', () => {
  test('the database itself rejects a second ACTIVE subscription', async () => {
    const a = academy!;
    const group = await createTestGroup(a);
    const trainee = await createTestTrainee(a);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, group.id));

    // Bypass the service entirely: the guarantee must not depend on every code
    // path remembering to check first.
    await expect(
      withTenantContext(a.tenantId, (tx) =>
        tx.traineeSubscription.create({
          data: {
            traineeId: trainee.id,
            planId: a.planId,
            levelId: a.levelId,
            status: 'ACTIVE',
            startDate: new Date(),
            endDate: new Date(Date.now() + 86_400_000),
            totalSessions: 8,
            amountDue: 0,
          },
        })
      )
    ).rejects.toThrow();

    expect(await activeCount(a, trainee.id)).toBe(1);
  }, 60_000);

  test('an expired subscription does not block a new active one', async () => {
    const a = academy!;
    const group = await createTestGroup(a);
    const trainee = await createTestTrainee(a);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, group.id));

    await withTenantContext(a.tenantId, (tx) =>
      tx.traineeSubscription.updateMany({
        where: { traineeId: trainee.id },
        data: { status: 'EXPIRED' },
      })
    );

    // History must stay unconstrained: only ACTIVE rows take part in the index.
    const renewed = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, input(a, trainee.id, group.id)
    );
    expect(renewed.subscription.status).toBe('ACTIVE');
    expect(await activeCount(a, trainee.id)).toBe(1);
  }, 60_000);

  test.each([0, 150, 400, 700])(
    'concurrent enrollments %ims apart never produce two ACTIVE subscriptions',
    async (staggerMs) => {
      const a = academy!;
      const [groupA, groupB] = await Promise.all([createTestGroup(a), createTestGroup(a)]);
      const trainee = await createTestTrainee(a);

      // Different groups on purpose: same-group enrollment was already
      // accidentally protected by GroupTrainee's uniqueness. This is the case
      // that slipped through.
      const first = enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, groupA.id));
      await sleep(staggerMs);
      const second = enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, groupB.id));

      const outcomes = await Promise.allSettled([first, second]);
      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter(
        (o): o is PromiseRejectedResult => o.status === 'rejected'
      );

      expect(await activeCount(a, trainee.id)).toBe(1);
      expect(fulfilled).toHaveLength(1);
      // The loser must get the clear business error, not a raw database one.
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ statusCode: 409 });
      expect(String(rejected[0].reason.message)).toMatch(/active subscription/i);
    },
    60_000
  );

  test('concurrent renewals never produce two ACTIVE subscriptions', async () => {
    const a = academy!;
    const group = await createTestGroup(a);
    const trainee = await createTestTrainee(a);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, group.id));

    const outcomes = await Promise.allSettled([
      renewSubscription(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, group.id)),
      renewSubscription(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, group.id)),
    ]);

    expect(await activeCount(a, trainee.id)).toBe(1);
    expect(outcomes.filter((o) => o.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
