/**
 * Subscription renewal — renew any time, the new one queued behind the current.
 *
 *   - While the current subscription runs, a renewal is stored UPCOMING and
 *     starts the day after the current one ends; once it has ended, the
 *     renewal starts today.
 *   - Money paid at renewal is recorded at once (receipt + ledger); the payment
 *     status and the balance are worked out by the server.
 *   - A queued renewal starts when the current one ends: by the nightly job
 *     (date passed) or by attendance (last session used, which starts it early).
 *     Its level and group take effect then.
 *   - One queued renewal per trainee is a database rule; seats in a group a
 *     renewal moves into are held for it.
 *
 * Runs against a real database: the guarantees live in constraints and locks.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  activateUpcomingSubscription,
  cancelUpcomingRenewal,
  enrollTrainee,
  getRenewalPreview,
  renewSubscription,
} from '@/services/subscription.service';
import { submitAttendance } from '@/services/attendance.service';
import { releaseLapsedSeats } from '@/services/group.service';
import { getAdminDashboard } from '@/services/dashboard.service';
import { getTraineeById } from '@/services/trainee.service';
import { runSubscriptionExpiryJob } from '@/jobs/subscription-expiry.job';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { addUtcDays, lastDayOfUtcMonth, utcDay } from '@/lib/utils/renewal';
import {
  provisionTestAcademy,
  destroyTestAcademy,
  createTestGroup,
  createTestTrainee,
  type TestAcademy,
} from '../helpers/test-academy';

let academy: TestAcademy | null = null;
let dashboardAcademy: TestAcademy | null = null;

beforeAll(async () => {
  academy = await provisionTestAcademy('renewal');
}, 120_000);

afterAll(async () => {
  try {
    await destroyTestAcademy(academy);
    await destroyTestAcademy(dashboardAcademy);
  } finally {
    await platformPrisma.$disconnect();
  }
});

// ─── Helpers ─────────────────────────────────────────────────

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const today = () => utcDay(new Date());

type Pay = { amountPaid?: number; levelId?: string; planId?: string };

const renewInput = (a: TestAcademy, traineeId: string, groupId: string, pay: Pay = {}) => {
  const amountPaid = pay.amountPaid ?? 500;
  return {
    traineeId,
    planId: pay.planId ?? a.planId,
    levelId: pay.levelId ?? a.levelId,
    groupId,
    amountPaid,
    ...(amountPaid > 0 && { paymentMethod: 'CASH' as const }),
  };
};

/** A trainee enrolled (paid) in a fresh group, mid-way through the test plan (30 days, 8 sessions). */
async function enrolled(a: TestAcademy, opts: { maxTrainees?: number } = {}) {
  const group = await createTestGroup(a, opts);
  const trainee = await createTestTrainee(a);
  const { subscription } = await enrollTrainee(a.tenantId, a.branchId, a.adminId, {
    traineeId: trainee.id,
    planId: a.planId,
    levelId: a.levelId,
    groupId: group.id,
    amountPaid: 500,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
  });
  return { trainee, group, current: subscription };
}

const subsOf = (a: TestAcademy, traineeId: string) =>
  withTenantContext(a.tenantId, (tx) =>
    tx.traineeSubscription.findMany({ where: { traineeId }, orderBy: { createdAt: 'asc' } })
  );

const groupsOf = (a: TestAcademy, traineeId: string) =>
  withTenantContext(a.tenantId, async (tx) =>
    (await tx.groupTrainee.findMany({ where: { traineeId }, select: { groupId: true } })).map(
      (m) => m.groupId
    )
  );

const setSub = (a: TestAcademy, id: string, data: Record<string, unknown>) =>
  withTenantContext(a.tenantId, (tx) => tx.traineeSubscription.update({ where: { id }, data }));

async function createLevel(a: TestAcademy, name: string) {
  return withTenantContext(a.tenantId, (tx) =>
    tx.subscriptionPlanLevel.create({ data: { planId: a.planId, name, sortOrder: 1 } })
  );
}

async function createSession(a: TestAcademy, groupId: string) {
  return withTenantContext(a.tenantId, (tx) =>
    tx.session.create({
      data: { branchId: a.branchId, groupId, scheduledAt: new Date(), durationMinutes: 60 },
    })
  );
}

// ─── Renewing ────────────────────────────────────────────────

describe('renewing while the current subscription runs', () => {
  test('queues the renewal to start the day after the current one ends', async () => {
    const a = academy!;
    const { trainee, group, current } = await enrolled(a);

    const result = await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id));

    expect(result.queued).toBe(true);
    expect(result.subscription.status).toBe('UPCOMING');
    const start = addUtcDays(current.endDate, 1);
    expect(ymd(result.subscription.startDate)).toBe(ymd(start));
    expect(ymd(result.subscription.endDate)).toBe(ymd(addUtcDays(start, 30)));
    expect(result.subscription.groupId).toBe(group.id);

    // The current one is untouched: same status, same dates.
    const [stillCurrent] = await subsOf(a, trainee.id);
    expect(stillCurrent.status).toBe('ACTIVE');
    expect(ymd(stillCurrent.endDate)).toBe(ymd(current.endDate));
  }, 60_000);

  test('a monthly plan renewed early covers the next calendar month', async () => {
    const a = academy!;
    const monthly = await withTenantContext(a.tenantId, async (tx) => {
      const plan = await tx.subscriptionPlan.create({
        data: {
          branchId: a.branchId,
          name: 'Calendar month',
          minSessions: 8,
          periodType: 'FROM_MONTH_START',
          freezeSessions: 2,
          freezeRetakeDays: 14,
          amount: 400,
          isActive: true,
        },
      });
      const level = await tx.subscriptionPlanLevel.create({
        data: { planId: plan.id, name: 'M1', sortOrder: 0 },
      });
      const group = await tx.group.create({
        data: {
          branchId: a.branchId,
          captainId: a.captainId,
          planId: plan.id,
          name: `Monthly ${Date.now()}`,
          minTrainees: 1,
          maxTrainees: 10,
          daysPerWeek: 2,
          scheduleDays: ['MONDAY', 'WEDNESDAY'],
          startTime: '17:00',
          sessionDuration: 60,
          isActive: true,
        },
      });
      return { plan, level, group };
    });
    const trainee = await createTestTrainee(a);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, {
      traineeId: trainee.id,
      planId: monthly.plan.id,
      levelId: monthly.level.id,
      groupId: monthly.group.id,
      amountPaid: 400,
      paymentStatus: 'PAID',
      paymentMethod: 'CASH',
    });
    // Pin the current one to this month, whatever date the suite runs on.
    const [current] = await subsOf(a, trainee.id);
    await setSub(a, current.id, { endDate: lastDayOfUtcMonth(today()) });

    const { subscription } = await renewSubscription(a.tenantId, a.branchId, a.adminId, {
      ...renewInput(a, trainee.id, monthly.group.id, { amountPaid: 400 }),
      planId: monthly.plan.id,
      levelId: monthly.level.id,
    });

    const firstOfNext = addUtcDays(lastDayOfUtcMonth(today()), 1);
    expect(subscription.status).toBe('UPCOMING');
    expect(ymd(subscription.startDate)).toBe(ymd(firstOfNext));
    expect(ymd(subscription.endDate)).toBe(ymd(lastDayOfUtcMonth(firstOfNext)));
  }, 60_000);

  test('a second renewal is refused while one is queued', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id));

    await expect(
      renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id))
    ).rejects.toMatchObject({ statusCode: 409 });
  }, 60_000);

  test('the database itself allows only one queued renewal per trainee', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id));

    await expect(
      withTenantContext(a.tenantId, (tx) =>
        tx.traineeSubscription.create({
          data: {
            traineeId: trainee.id,
            planId: a.planId,
            levelId: a.levelId,
            status: 'UPCOMING',
            startDate: new Date(),
            endDate: new Date(),
            totalSessions: 8,
            amountDue: 500,
          },
        })
      )
    ).rejects.toThrow();
  }, 60_000);
});

describe('renewing once the current subscription has ended', () => {
  test('after expiry it starts today', async () => {
    const a = academy!;
    const { trainee, group, current } = await enrolled(a);
    await setSub(a, current.id, { status: 'EXPIRED', expiredAt: new Date() });

    const result = await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id));

    expect(result.queued).toBe(false);
    expect(result.subscription.status).toBe('ACTIVE');
    expect(ymd(result.subscription.startDate)).toBe(ymd(today()));
    expect(ymd(result.subscription.endDate)).toBe(ymd(addUtcDays(today(), 30)));
  }, 60_000);

  test('ended by date but not yet closed by the nightly job: closes it and starts today', async () => {
    const a = academy!;
    const { trainee, group, current } = await enrolled(a);
    const ended = addUtcDays(today(), -2);
    await setSub(a, current.id, { endDate: ended });

    const result = await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id));

    expect(result.subscription.status).toBe('ACTIVE');
    expect(ymd(result.subscription.startDate)).toBe(ymd(today()));
    const old = (await subsOf(a, trainee.id)).find((s) => s.id === current.id)!;
    expect(old.status).toBe('EXPIRED');
    // Anchored like the nightly job: the end date, so the grace window is right.
    expect(ymd(old.expiredAt)).toBe(ymd(ended));
  }, 60_000);

  test('every session used: starts today', async () => {
    const a = academy!;
    const { trainee, group, current } = await enrolled(a);
    await setSub(a, current.id, { attendedSessions: 8 });

    const result = await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id));

    expect(result.subscription.status).toBe('ACTIVE');
    expect(ymd(result.subscription.startDate)).toBe(ymd(today()));
  }, 60_000);
});

// ─── Money ───────────────────────────────────────────────────

describe('money', () => {
  const ledgerFor = (a: TestAcademy, receiptId: string) =>
    withTenantContext(a.tenantId, (tx) =>
      tx.financialTransaction.findMany({ where: { referenceId: receiptId } })
    );

  test('paid in full: receipt + one INCOME entry, PAID, nothing due', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    const { subscription, receipt } = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id)
    );

    expect(receipt).not.toBeNull();
    expect(Number(receipt!.amount)).toBe(500);
    expect(subscription.paymentStatus).toBe('PAID');
    expect(Number(subscription.amountDue)).toBe(0);
    const ledger = await ledgerFor(a, receipt!.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe('INCOME');
    expect(Number(ledger[0].amount)).toBe(500);
    // Money is booked the day it is paid, not the day the renewal starts.
    expect(ymd(ledger[0].date)).toBe(ymd(today()));
  }, 60_000);

  test('part paid: PARTIAL, the rest due', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    const { subscription, receipt } = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id, { amountPaid: 200 })
    );

    expect(subscription.paymentStatus).toBe('PARTIAL');
    expect(Number(subscription.amountDue)).toBe(300);
    expect(await ledgerFor(a, receipt!.id)).toHaveLength(1);
  }, 60_000);

  test('nothing paid: no receipt, no ledger entry, UNPAID', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    const { subscription, receipt } = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id, { amountPaid: 0 })
    );

    expect(receipt).toBeNull();
    expect(subscription.paymentStatus).toBe('UNPAID');
    expect(Number(subscription.amountDue)).toBe(500);
    const receipts = await withTenantContext(a.tenantId, (tx) =>
      tx.receipt.count({ where: { subscriptionId: subscription.id } })
    );
    expect(receipts).toBe(0);
  }, 60_000);

  test('paying more than the price is refused', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    await expect(
      renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id, { amountPaid: 600 }))
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await subsOf(a, trainee.id)).toHaveLength(1);
  }, 60_000);
});

// ─── Validation and seats ────────────────────────────────────

describe('validation and seats', () => {
  test('a level of another plan is refused', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    const otherLevel = await withTenantContext(a.tenantId, async (tx) => {
      const plan = await tx.subscriptionPlan.create({
        data: {
          branchId: a.branchId, name: 'Other', minSessions: 4, periodType: 'FROM_SUBSCRIPTION_DATE',
          periodDays: 30, freezeSessions: 0, freezeRetakeDays: 0, amount: 100, isActive: true,
        },
      });
      return tx.subscriptionPlanLevel.create({ data: { planId: plan.id, name: 'X', sortOrder: 0 } });
    });

    await expect(
      renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id, { levelId: otherLevel.id }))
    ).rejects.toMatchObject({ statusCode: 400 });
  }, 60_000);

  test('a queued move holds its seat: a full group (counting queued moves) is refused', async () => {
    const a = academy!;
    const target = await createTestGroup(a, { maxTrainees: 1 });
    const first = await enrolled(a);
    const second = await enrolled(a);

    // The one seat is free, so the first queued move takes it…
    await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, first.trainee.id, target.id));
    // …and the second finds it held, though nobody sits there yet.
    await expect(
      renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, second.trainee.id, target.id))
    ).rejects.toMatchObject({ statusCode: 409 });
  }, 60_000);

  test('the trainee keeps their group until the renewal starts', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    const target = await createTestGroup(a);
    await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, target.id));

    expect(await groupsOf(a, trainee.id)).toEqual([group.id]);
  }, 60_000);
});

// ─── Activation ──────────────────────────────────────────────

describe('a queued renewal starts when the current one ends', () => {
  test('the nightly job starts it on its planned dates, with its level and group', async () => {
    const a = academy!;
    const { trainee, current } = await enrolled(a);
    const target = await createTestGroup(a);
    const level2 = await createLevel(a, `Level 2 ${Date.now()}`);
    const { subscription: queued } = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, target.id, { levelId: level2.id })
    );

    // Time passes: the current one ended yesterday, the renewal is due today.
    await setSub(a, current.id, { endDate: addUtcDays(today(), -1) });
    await setSub(a, queued.id, { startDate: today(), endDate: addUtcDays(today(), 30) });

    await runSubscriptionExpiryJob(a.tenantId);

    const [old, renewed] = await subsOf(a, trainee.id);
    expect(old.status).toBe('EXPIRED');
    expect(renewed.status).toBe('ACTIVE');
    expect(ymd(renewed.startDate)).toBe(ymd(today()));
    expect(ymd(renewed.endDate)).toBe(ymd(addUtcDays(today(), 30)));
    expect(await groupsOf(a, trainee.id)).toEqual([target.id]);
    const profile = await withTenantContext(a.tenantId, (tx) =>
      tx.traineeProfile.findUniqueOrThrow({ where: { id: trainee.id }, select: { levelId: true } })
    );
    expect(profile.levelId).toBe(level2.id);
  }, 120_000);

  test('the nightly job leaves a renewal queued while the current one still runs', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id));

    await runSubscriptionExpiryJob(a.tenantId);

    expect((await subsOf(a, trainee.id)).map((s) => s.status)).toEqual(['ACTIVE', 'UPCOMING']);
  }, 120_000);

  test('using the last session starts it at once (early), and a correction does not touch it', async () => {
    const a = academy!;
    const { trainee, group, current } = await enrolled(a);
    await setSub(a, current.id, { attendedSessions: 7 });
    const { subscription: queued } = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id)
    );
    const session = await createSession(a, group.id);

    await submitAttendance(a.tenantId, a.branchId, session.id, [{ traineeId: trainee.id, status: 'PRESENT' }], a.adminId);

    let [old, renewed] = await subsOf(a, trainee.id);
    expect(old.status).toBe('EXPIRED');
    expect(old.attendedSessions).toBe(8);
    expect(renewed.id).toBe(queued.id);
    expect(renewed.status).toBe('ACTIVE');
    // Early start: today, and a day-based plan runs its full length from today.
    expect(ymd(renewed.startDate)).toBe(ymd(today()));
    expect(ymd(renewed.endDate)).toBe(ymd(addUtcDays(today(), 30)));
    expect(await groupsOf(a, trainee.id)).toEqual([group.id]);

    // Corrected to ABSENT: the mark belonged to the old subscription.
    await submitAttendance(a.tenantId, a.branchId, session.id, [{ traineeId: trainee.id, status: 'ABSENT' }], a.adminId);

    [old, renewed] = await subsOf(a, trainee.id);
    expect(old.attendedSessions).toBe(7);
    expect(old.status).toBe('EXPIRED'); // the renewal stays the running one
    expect(renewed.status).toBe('ACTIVE');
    expect(renewed.attendedSessions).toBe(0);
    expect(renewed.freezeUsed).toBe(0);
  }, 60_000);

  test('attendance counts against the current subscription, not the queued one', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id));
    const session = await createSession(a, group.id);

    await submitAttendance(a.tenantId, a.branchId, session.id, [{ traineeId: trainee.id, status: 'PRESENT' }], a.adminId);

    const [current, queued] = await subsOf(a, trainee.id);
    expect([current.status, current.attendedSessions]).toEqual(['ACTIVE', 1]);
    expect([queued.status, queued.attendedSessions]).toEqual(['UPCOMING', 0]);
  }, 60_000);

  test('a target group that filled up meanwhile keeps the trainee where they are, and says why', async () => {
    const a = academy!;
    const { trainee, group, current } = await enrolled(a);
    const target = await createTestGroup(a, { maxTrainees: 1 });
    const { subscription: queued } = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, target.id)
    );
    // Enrolment into the group takes the seat directly.
    const other = await createTestTrainee(a);
    await enrollTrainee(a.tenantId, a.branchId, a.adminId, {
      traineeId: other.id, planId: a.planId, levelId: a.levelId, groupId: target.id,
      amountPaid: 500, paymentStatus: 'PAID', paymentMethod: 'CASH',
    });
    await setSub(a, current.id, { status: 'EXPIRED', expiredAt: new Date() });

    const started = await withTenantContext(a.tenantId, (tx) => activateUpcomingSubscription(tx, trainee.id));

    expect(started?.status).toBe('ACTIVE');
    expect(await groupsOf(a, trainee.id)).toEqual([group.id]);
    const audit = await withTenantContext(a.tenantId, (tx) =>
      tx.auditLog.findFirst({
        where: { entityType: 'TraineeSubscription', entityId: queued.id, action: 'STATUS_CHANGE' },
      })
    );
    expect(audit?.newValues).toMatchObject({ status: 'ACTIVE', note: expect.stringMatching(/full/) });
  }, 60_000);

  test('a trainee with a queued renewal keeps their seat past the retake window', async () => {
    const a = academy!;
    const { trainee, group, current } = await enrolled(a);
    await renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id));
    // Make the current one long over without the renewal starting (as if
    // activation had been delayed), then release lapsed seats directly.
    await setSub(a, current.id, {
      status: 'EXPIRED',
      endDate: addUtcDays(today(), -40),
      expiredAt: addUtcDays(today(), -40),
    });

    await withTenantContext(a.tenantId, (tx) => releaseLapsedSeats(tx));

    expect(await groupsOf(a, trainee.id)).toEqual([group.id]);
  }, 60_000);
});

// ─── Cancelling ──────────────────────────────────────────────

describe('cancelling a queued renewal', () => {
  test('an unpaid one is removed', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    const { subscription } = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id, { amountPaid: 0 })
    );

    await cancelUpcomingRenewal(a.tenantId, a.branchId, a.adminId, subscription.id);

    expect((await subsOf(a, trainee.id)).map((s) => s.status)).toEqual(['ACTIVE']);
    // …and the trainee can renew again.
    await expect(
      renewSubscription(a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id))
    ).resolves.toBeDefined();
  }, 60_000);

  test('one with money paid on it is refused', async () => {
    const a = academy!;
    const { trainee, group } = await enrolled(a);
    const { subscription } = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id, { amountPaid: 100 })
    );

    await expect(
      cancelUpcomingRenewal(a.tenantId, a.branchId, a.adminId, subscription.id)
    ).rejects.toMatchObject({ statusCode: 409 });
  }, 60_000);

  test('a subscription that has started cannot be cancelled this way', async () => {
    const a = academy!;
    const { current } = await enrolled(a);
    await expect(
      cancelUpcomingRenewal(a.tenantId, a.branchId, a.adminId, current.id)
    ).rejects.toMatchObject({ statusCode: 409 });
  }, 60_000);
});

// ─── What the screens read ───────────────────────────────────

describe('preview, trainee page and dashboard', () => {
  test('the preview prefills the last plan, level and group, with price and queued dates', async () => {
    const a = academy!;
    const { trainee, group, current } = await enrolled(a);

    const preview = await getRenewalPreview(a.tenantId, a.branchId, { traineeId: trainee.id });

    expect(preview.defaults).toEqual({ planId: a.planId, levelId: a.levelId, groupId: group.id });
    expect(preview.plan).toMatchObject({ id: a.planId, amount: 500, minSessions: 8 });
    expect(preview.queued).toBe(true);
    expect(ymd(preview.startDate)).toBe(ymd(addUtcDays(current.endDate, 1)));
    expect(preview.current?.running).toBe(true);
    expect(preview.upcoming).toBeNull();
  }, 60_000);

  test('the trainee page sees the queued renewal and the last subscription', async () => {
    const a = academy!;
    const { trainee, group, current } = await enrolled(a);
    const { subscription } = await renewSubscription(
      a.tenantId, a.branchId, a.adminId, renewInput(a, trainee.id, group.id, { amountPaid: 200 })
    );

    const detail = await getTraineeById(a.tenantId, a.branchId, trainee.id);

    expect(detail.subscriptions.map((s) => s.id)).toEqual([current.id]);
    expect(detail.lastSubscription?.id).toBe(current.id);
    expect(detail.upcomingSubscription?.id).toBe(subscription.id);
    expect(Number(detail.upcomingSubscription?.amountDue)).toBe(300);
  }, 60_000);

  test('the dashboard links each expiring subscription to its trainee and marks the renewed', async () => {
    // Its own academy: the list shows the first five by end date in the branch.
    dashboardAcademy = await provisionTestAcademy('renewdash');
    const a = dashboardAcademy;
    const renewing = await enrolled(a);
    const notYet = await enrolled(a);
    for (const { current } of [renewing, notYet]) {
      await setSub(a, current.id, { endDate: addUtcDays(today(), 3) });
    }
    await renewSubscription(
      a.tenantId, a.branchId, a.adminId, renewInput(a, renewing.trainee.id, renewing.group.id)
    );

    const dashboard = await getAdminDashboard(a.tenantId, a.branchId);

    const byTrainee = Object.fromEntries(
      (dashboard.expiringSoon ?? []).map((e) => [e.traineeId, e.renewed])
    );
    expect(byTrainee).toEqual({ [renewing.trainee.id]: true, [notYet.trainee.id]: false });
  }, 120_000);
});
