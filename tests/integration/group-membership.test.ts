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
import { subDays } from 'date-fns';
import { enrollTrainee, renewSubscription } from '@/services/subscription.service';
import { getAttendanceSheet } from '@/services/attendance.service';
import { runSubscriptionExpiryJob } from '@/jobs/subscription-expiry.job';
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

/**
 * Lapsed trainees release their seats — hardening plan §42.
 *
 * Nothing removed a membership once the retake window had passed, so groups
 * filled with people who had left and refused new enrollments. The daily expiry
 * job now releases those seats, using the attendance sheet's own rule for "past
 * the window". The fixture's plan has a 14-day retake window.
 */
describe('lapsed trainees release their seats (§42)', () => {
  /** Enroll, then move the subscription's end `daysAgo` into the past. */
  async function endedSubscription(
    a: TestAcademy,
    groupId: string,
    opts: { daysAgo: number; status: 'ACTIVE' | 'EXPIRED' }
  ) {
    const trainee = await createTestTrainee(a);
    const { subscription } = await enrollTrainee(
      a.tenantId, a.branchId, a.adminId, input(a, trainee.id, groupId)
    );
    const ended = subDays(new Date(), opts.daysAgo);
    await withTenantContext(a.tenantId, (tx) =>
      tx.traineeSubscription.update({
        where: { id: subscription.id },
        data: {
          status: opts.status,
          endDate: ended,
          expiredAt: opts.status === 'EXPIRED' ? ended : null,
        },
      })
    );
    return trainee;
  }

  test('the daily job releases only seats past the retake window', async () => {
    const a = academy!;
    const group = await createTestGroup(a);

    // Still ACTIVE on paper, but its end date was 30 days ago: the job expires
    // it and, 30 > 14, releases the seat in the same run.
    const longGone = await endedSubscription(a, group.id, { daysAgo: 30, status: 'ACTIVE' });
    // Ended 5 days ago: inside the window, still allowed makeups.
    const recent = await endedSubscription(a, group.id, { daysAgo: 5, status: 'EXPIRED' });
    // Training now.
    const current = await createTestTrainee(a);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, current.id, group.id));
    // An old expired subscription, then a renewal: the latest one decides.
    const renewed = await endedSubscription(a, group.id, { daysAgo: 60, status: 'EXPIRED' });
    await renewSubscription(a.tenantId, a.branchId, a.adminId, input(a, renewed.id, group.id));

    await runSubscriptionExpiryJob(a.tenantId);

    const members = await withTenantContext(a.tenantId, async (tx) =>
      (await tx.groupTrainee.findMany({ where: { groupId: group.id }, select: { traineeId: true } }))
        .map((m) => m.traineeId)
        .sort()
    );
    expect(members).toEqual([recent.id, current.id, renewed.id].sort());

    // Staff can see why someone left the group.
    const audit = await withTenantContext(a.tenantId, (tx) =>
      tx.auditLog.findFirst({ where: { entityType: 'Group', entityId: group.id }, orderBy: { createdAt: 'desc' } })
    );
    expect(audit?.newValues).toMatchObject({ removedTrainee: longGone.id, reason: 'retake window ended' });
  }, 120_000);

  test('a released seat can be taken by a new trainee', async () => {
    const a = academy!;
    const group = await createTestGroup(a, { maxTrainees: 1 });
    await endedSubscription(a, group.id, { daysAgo: 40, status: 'EXPIRED' });
    const newcomer = await createTestTrainee(a);

    // Before the job: the lapsed trainee still holds the only seat.
    await expect(
      enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, newcomer.id, group.id))
    ).rejects.toMatchObject({ statusCode: 409 });

    await runSubscriptionExpiryJob(a.tenantId);

    await expect(
      enrollTrainee(a.tenantId, a.branchId, a.adminId, input(a, newcomer.id, group.id))
    ).resolves.toBeDefined();
  }, 120_000);

  test('a released trainee still shows on the sheets of sessions they attended', async () => {
    const a = academy!;
    const group = await createTestGroup(a);
    const gone = await endedSubscription(a, group.id, { daysAgo: 45, status: 'EXPIRED' });

    const sessionId = await withTenantContext(a.tenantId, async (tx) => {
      const session = await tx.session.create({
        data: {
          branchId: a.branchId,
          groupId: group.id,
          scheduledAt: subDays(new Date(), 50),
          durationMinutes: 60,
          status: 'COMPLETED',
        },
      });
      await tx.attendanceRecord.create({
        data: {
          branchId: a.branchId, sessionId: session.id, traineeId: gone.id,
          status: 'PRESENT', markedBy: a.adminId,
        },
      });
      return session.id;
    });

    await runSubscriptionExpiryJob(a.tenantId);
    expect(await groupsOf(a, gone.id)).toEqual([]);

    // Rows came only from current members, so this mark used to vanish.
    const sheet = await getAttendanceSheet(a.tenantId, a.branchId, sessionId);
    const rows = sheet.trainees as Array<{
      traineeId: string;
      attendance: { status: string } | null;
      canMark: boolean;
    }>;
    const row = rows.find((t) => t.traineeId === gone.id);
    expect(row?.attendance).toMatchObject({ status: 'PRESENT' });
    expect(row?.canMark).toBe(false);
  }, 120_000);
});
