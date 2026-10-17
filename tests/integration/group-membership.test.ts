/**
 * Group membership on enrollment and renewal — hardening plan §27.
 *
 * Memberships outlive subscriptions (the attendance sheet uses them for the
 * post-expiry retake window), and enrollment and renewal handled that
 * differently: enrollment `create`d the membership and failed on the
 * (group_id, trainee_id) unique constraint for a returning member, and both
 * counted the trainee against their own seat. Reproduced: an expired trainee
 * could not re-enroll into their old group, and a member of a full 2-seat group
 * could not renew into it.
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
  academy = await provisionTestAcademy('groups');
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

const expire = (a: TestAcademy, traineeId: string) =>
  withTenantContext(a.tenantId, (tx) =>
    tx.traineeSubscription.updateMany({
      where: { traineeId, status: 'ACTIVE' },
      data: { status: 'EXPIRED', expiredAt: new Date() },
    })
  );

const groupsOf = (a: TestAcademy, traineeId: string) =>
  withTenantContext(a.tenantId, async (tx) =>
    (await tx.groupTrainee.findMany({ where: { traineeId }, select: { groupId: true } })).map(
      (m) => m.groupId
    )
  );

const memberCount = (a: TestAcademy, groupId: string) =>
  withTenantContext(a.tenantId, (tx) => tx.groupTrainee.count({ where: { groupId } }));

describe('returning trainees', () => {
  test('an expired trainee can re-enroll into the group they were in', async () => {
    const a = academy!;
    const group = await createTestGroup(a);
    const trainee = await createTestTrainee(a);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, group.id));
    await expire(a, trainee.id);

    // Still a member (retake window), so `create` used to fail with P2002.
    const again = await enrollTrainee(
      a.tenantId, a.branchId, a.adminId, input(a, trainee.id, group.id)
    );
    expect(again.subscription.status).toBe('ACTIVE');
    expect(await groupsOf(a, trainee.id)).toEqual([group.id]);
  }, 60_000);

  test('a member of a full group can renew into it', async () => {
    const a = academy!;
    const group = await createTestGroup(a, { maxTrainees: 2 });
    const [one, two] = await Promise.all([createTestTrainee(a), createTestTrainee(a)]);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, one.id, group.id));
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, two.id, group.id));

    // Two members in two seats; renewing one of them used to say "Group is at
    // maximum capacity" while they already held one of the two.
    const renewed = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, input(a, one.id, group.id)
    );
    expect(renewed.subscription.status).toBe('ACTIVE');
    expect(await memberCount(a, group.id)).toBe(2);
  }, 60_000);

  test('an expired member of a full group can re-enroll into it', async () => {
    const a = academy!;
    const group = await createTestGroup(a, { maxTrainees: 1 });
    const trainee = await createTestTrainee(a);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, group.id));
    await expire(a, trainee.id);

    await expect(
      enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, group.id))
    ).resolves.toBeDefined();
  }, 60_000);
});

describe('capacity and moves', () => {
  test('a full group still refuses a new trainee', async () => {
    const a = academy!;
    const group = await createTestGroup(a, { maxTrainees: 1 });
    const [member, newcomer] = await Promise.all([createTestTrainee(a), createTestTrainee(a)]);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, member.id, group.id));

    await expect(
      enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, newcomer.id, group.id))
    ).rejects.toMatchObject({ statusCode: 409 });
  }, 60_000);

  test('enrolling into another group moves the trainee out of the old one', async () => {
    const a = academy!;
    const [oldGroup, newGroup] = await Promise.all([createTestGroup(a), createTestGroup(a)]);
    const trainee = await createTestTrainee(a);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, oldGroup.id));
    await expire(a, trainee.id);

    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, trainee.id, newGroup.id));
    // Staying behind took a seat in the old group and a line on its attendance sheet.
    expect(await groupsOf(a, trainee.id)).toEqual([newGroup.id]);
  }, 60_000);

  test.each([0, 100, 300])(
    'two trainees racing for the last seat (%ims apart): exactly one gets it',
    async (staggerMs) => {
      const a = academy!;
      const group = await createTestGroup(a, { maxTrainees: 1 });
      const [one, two] = await Promise.all([createTestTrainee(a), createTestTrainee(a)]);

      const first = enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, one.id, group.id));
      await new Promise((r) => setTimeout(r, staggerMs));
      const second = enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, two.id, group.id));

      const outcomes = await Promise.allSettled([first, second]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(await memberCount(a, group.id)).toBe(1);
    },
    60_000
  );
});
