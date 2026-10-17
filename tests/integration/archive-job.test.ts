/**
 * The archive job, end to end on backdated data — hardening plan §28.
 *
 * Before: subscriptions were archived after 1 year and receipts after 5, but
 * receipts reference subscriptions ON DELETE RESTRICT, so the subscription step
 * failed on the foreign key, and because all steps shared one try/catch,
 * receipts, expenses, the ledger and payroll were never archived either.
 * Reproduced: after a run, a two-year-expired subscription and a six-year-old
 * expense were both still live, and the error was the foreign key. The job had
 * never run against qualifying data before.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { subYears } from 'date-fns';
import { enrollTrainee } from '@/services/subscription.service';
import { recordLedgerEntry } from '@/services/ledger';
import {
  runArchiveJob,
  runArchiveSteps,
  ArchiveJobError,
  ARCHIVE_STEPS,
} from '@/jobs/archive-records.job';
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
  academy = await provisionTestAcademy('archive');
}, 120_000);

afterAll(async () => {
  try {
    await destroyTestAcademy(academy);
  } finally {
    await platformPrisma.$disconnect();
  }
});

const yearsAgo = (n: number) => subYears(new Date(), n);

/** Enroll a trainee and backdate the subscription's end (and optionally its receipts). */
async function expiredSubscription(
  a: TestAcademy,
  opts: { endedYearsAgo: number; receiptsYearsAgo?: number }
) {
  const [group, trainee] = await Promise.all([createTestGroup(a), createTestTrainee(a)]);
  const { subscription, receipt } = await enrollTrainee(a.tenantId, a.branchId, a.adminId, {
    traineeId: trainee.id,
    planId: a.planId,
    levelId: a.levelId,
    groupId: group.id,
    amountPaid: 500,
    paymentStatus: 'PAID',
    paymentMethod: 'INSTAPAY',
  });
  const ended = yearsAgo(opts.endedYearsAgo);

  await withTenantContext(a.tenantId, async (tx) => {
    await tx.traineeSubscription.update({
      where: { id: subscription.id },
      data: { status: 'EXPIRED', endDate: ended, expiredAt: ended },
    });
    if (opts.receiptsYearsAgo !== undefined) {
      const at = yearsAgo(opts.receiptsYearsAgo);
      await tx.receipt.update({ where: { id: receipt.id }, data: { createdAt: at } });
      await tx.financialTransaction.updateMany({
        where: { referenceId: receipt.id },
        data: { createdAt: at },
      });
    }
  });
  return { subscriptionId: subscription.id, receiptId: receipt.id, ended };
}

/** An expense, a manual income and a paid payroll, each with its ledger row, at `at`. */
async function financialSources(a: TestAcademy, at: Date) {
  return withTenantContext(a.tenantId, async (tx) => {
    const expense = await tx.expense.create({
      data: {
        branchId: a.branchId, category: 'Rent', amount: 1000, date: at,
        createdBy: a.adminId, createdAt: at,
      },
    });
    const income = await tx.manualIncome.create({
      data: {
        branchId: a.branchId, category: 'Rental', amount: 300, date: at,
        createdBy: a.adminId, createdAt: at,
      },
    });
    const payroll = await tx.captainPayroll.create({
      data: {
        branchId: a.branchId, captainId: a.captainId, periodStart: at, periodEnd: at,
        payrollType: 'HOURS', totalAmount: 800, isPaid: true, paidAt: at, createdAt: at,
      },
    });
    const unpaid = await tx.captainPayroll.create({
      data: {
        branchId: a.branchId, captainId: a.captainId, periodStart: at, periodEnd: at,
        payrollType: 'HOURS', totalAmount: 50, isPaid: false, createdAt: at,
      },
    });
    for (const [type, referenceId, amount] of [
      ['EXPENSE', expense.id, 1000],
      ['INCOME', income.id, 300],
      ['EXPENSE', payroll.id, 800],
    ] as const) {
      await recordLedgerEntry(tx, {
        branchId: a.branchId, type, referenceId, amount, date: at,
        description: 'backdated', createdBy: a.adminId,
      });
      await tx.financialTransaction.updateMany({ where: { referenceId }, data: { createdAt: at } });
    }
    return { expenseId: expense.id, incomeId: income.id, payrollId: payroll.id, unpaidId: unpaid.id };
  });
}

/** An attendance record (and the session it belongs to) marked `at`. */
async function attendanceRecord(a: TestAcademy, at: Date) {
  const [group, trainee] = await Promise.all([createTestGroup(a), createTestTrainee(a)]);
  return withTenantContext(a.tenantId, async (tx) => {
    const session = await tx.session.create({
      data: { branchId: a.branchId, groupId: group.id, scheduledAt: at, durationMinutes: 60 },
    });
    const record = await tx.attendanceRecord.create({
      data: {
        branchId: a.branchId, sessionId: session.id, traineeId: trainee.id,
        status: 'PRESENT', markedBy: a.adminId, markedAt: at, createdAt: at,
      },
    });
    return record.id;
  });
}

describe('runArchiveJob', () => {
  test('archives everything eligible, in one run, without losing a field', async () => {
    const a = academy!;
    // Old enough on both counts: receipt (6y) and subscription (ended 6y ago).
    const old = await expiredSubscription(a, { endedYearsAgo: 6, receiptsYearsAgo: 6 });
    // The case that broke the job: subscription ended 2 years ago, receipt young.
    const pinned = await expiredSubscription(a, { endedYearsAgo: 2 });
    const sources = await financialSources(a, yearsAgo(6));
    const attendanceId = await attendanceRecord(a, yearsAgo(2));

    // Used to fail on the foreign key and skip every later step.
    await expect(runArchiveJob(a.tenantId)).resolves.toBeUndefined();

    await withTenantContext(a.tenantId, async (tx) => {
      // The pinned subscription waits for its receipt: still live, not an error.
      expect(await tx.traineeSubscription.count({ where: { id: pinned.subscriptionId } })).toBe(1);
      expect(await tx.receipt.count({ where: { id: pinned.receiptId } })).toBe(1);

      // The old subscription left in the same run as its receipt.
      expect(await tx.traineeSubscription.count({ where: { id: old.subscriptionId } })).toBe(0);
      const archivedSub = await tx.archivedTraineeSubscription.findUniqueOrThrow({
        where: { id: old.subscriptionId },
      });
      expect(archivedSub.expiredAt?.getTime()).toBe(old.ended.getTime());

      // payment_method used to be dropped on archive.
      expect(await tx.receipt.count({ where: { id: old.receiptId } })).toBe(0);
      const archivedReceipt = await tx.archivedReceipt.findUniqueOrThrow({
        where: { id: old.receiptId },
      });
      expect(archivedReceipt.paymentMethod).toBe('INSTAPAY');

      // Sources moved together with their ledger rows.
      expect(await tx.expense.count({ where: { id: sources.expenseId } })).toBe(0);
      expect(await tx.archivedExpense.count({ where: { id: sources.expenseId } })).toBe(1);
      // Manual income had no archive table: its ledger rows left, it never did.
      expect(await tx.manualIncome.count({ where: { id: sources.incomeId } })).toBe(0);
      expect(await tx.archivedManualIncome.count({ where: { id: sources.incomeId } })).toBe(1);
      expect(await tx.captainPayroll.count({ where: { id: sources.payrollId } })).toBe(0);
      expect(await tx.archivedCaptainPayroll.count({ where: { id: sources.payrollId } })).toBe(1);
      // Never an unpaid payroll, however old.
      expect(await tx.captainPayroll.count({ where: { id: sources.unpaidId } })).toBe(1);

      const movedRefs = [old.receiptId, sources.expenseId, sources.incomeId, sources.payrollId];
      expect(
        await tx.financialTransaction.count({ where: { referenceId: { in: movedRefs } } })
      ).toBe(0);
      expect(
        await tx.archivedFinancialTransaction.count({ where: { referenceId: { in: movedRefs } } })
      ).toBe(4);
      // The pinned receipt's ledger row stays with its receipt.
      expect(
        await tx.financialTransaction.count({ where: { referenceId: pinned.receiptId } })
      ).toBe(1);

      expect(await tx.attendanceRecord.count({ where: { id: attendanceId } })).toBe(0);
      expect(await tx.archivedAttendanceRecord.count({ where: { id: attendanceId } })).toBe(1);
    });
  }, 120_000);

  test('one failing step does not stop the others, and the run reports it', async () => {
    const a = academy!;
    const sources = await financialSources(a, yearsAgo(7));

    // Break one step for real: this academy's schema is disposable.
    await withTenantContext(a.tenantId, (tx) =>
      tx.$executeRawUnsafe('ALTER TABLE archived_expenses RENAME TO archived_expenses_offline')
    );
    try {
      const run = runArchiveSteps(a.tenantId, ARCHIVE_STEPS, {
        attendanceSubscription: yearsAgo(1),
        financial: yearsAgo(5),
      });
      await expect(run).rejects.toBeInstanceOf(ArchiveJobError);
      await expect(run).rejects.toMatchObject({ failedSteps: ['expenses'] });

      await withTenantContext(a.tenantId, async (tx) => {
        // The failed step rolled back whole: the expense and its ledger row stay live.
        expect(await tx.expense.count({ where: { id: sources.expenseId } })).toBe(1);
        expect(await tx.financialTransaction.count({ where: { referenceId: sources.expenseId } })).toBe(1);
        // Every step after it still ran.
        expect(await tx.archivedManualIncome.count({ where: { id: sources.incomeId } })).toBe(1);
        expect(await tx.archivedCaptainPayroll.count({ where: { id: sources.payrollId } })).toBe(1);
      });
    } finally {
      await withTenantContext(a.tenantId, (tx) =>
        tx.$executeRawUnsafe('ALTER TABLE archived_expenses_offline RENAME TO archived_expenses')
      );
    }
  }, 120_000);

  test('a run with nothing to do changes nothing', async () => {
    const a = academy!;
    const cutoffs = { attendanceSubscription: yearsAgo(1), financial: yearsAgo(5) };
    // Drain whatever the tests above left eligible (the failed step's expense).
    await runArchiveSteps(a.tenantId, ARCHIVE_STEPS, cutoffs);

    const recent = await expiredSubscription(a, { endedYearsAgo: 0 });
    const counts = await runArchiveSteps(a.tenantId, ARCHIVE_STEPS, cutoffs);
    expect(counts).toEqual(Object.fromEntries(ARCHIVE_STEPS.map((s) => [s.name, 0])));
    const stillLive = await withTenantContext(a.tenantId, (tx) =>
      tx.traineeSubscription.count({ where: { id: recent.subscriptionId } })
    );
    expect(stillLive).toBe(1);
  }, 120_000);
});
