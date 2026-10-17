/**
 * Archive Records Job
 *
 * Weekly job: moves old records to archived_* tables per retention policy.
 *
 * Retention (cutoffs in src/lib/utils/archive.ts):
 *   - attendance records: older than 1 year;
 *   - financial sources (receipts, expenses, manual incomes, paid payrolls),
 *     each together with its ledger row: older than 5 years;
 *   - expired subscriptions: ended more than 1 year ago AND none of their
 *     receipts is still live;
 *   - any ledger row older than 5 years still live once its source has gone.
 *
 * ⚠️ RETENTION FOLLOWS THE FOREIGN KEYS (hardening plan §28).
 *    receipts.subscription_id references trainee_subscriptions ON DELETE
 *    RESTRICT, and nearly every subscription has a receipt. Archiving
 *    subscriptions after 1 year while their receipts stayed 5 meant deleting
 *    rows the receipts still pointed at: the step failed on the foreign key.
 *    Because every step shared one try/catch, receipts, expenses, the ledger and
 *    payroll were then never archived either, silently, every week, from about
 *    a year after launch. A subscription now waits for its receipts, and the
 *    receipt step runs first, so a subscription whose receipts leave in a run
 *    follows in the same run.
 *
 * ⚠️ EACH STEP STANDS ALONE. Every step runs in its own transactions with its
 *    own error handler. A failure is reported to Sentry, the remaining steps
 *    still run, and the run then throws, so the scheduler counts this academy
 *    as failed instead of logging success.
 *
 * ⚠️ A SOURCE AND ITS LEDGER ROW MOVE TOGETHER, in one transaction, the ledger
 *    row picked by its reference to the source rather than by its own
 *    timestamp. Separately chosen cutoffs could split a pair at the boundary,
 *    and a live expense whose ledger row had been archived could no longer be
 *    edited (ledger.ts refuses an edit with no mirror).
 *
 * ⚠️ ID-CAPTURE PATTERN: IDs are captured from the SELECT, then that exact
 *    set is used for the INSERT and the DELETE. The DELETE never re-runs the
 *    WHERE clause; if it did, records inserted between the INSERT and DELETE
 *    would be deleted without being archived — silent, unrecoverable data loss.
 *
 * Work is done in batches of ARCHIVE_BATCH_SIZE, one transaction each, so a
 * backlog (the first run after the worker has been off for months) cannot run
 * into the transaction timeout.
 */

import * as Sentry from '@sentry/nextjs';
import { withTenantContext, type TransactionClient } from '@/lib/db/tenant-client';
import {
  getAttendanceSubscriptionArchiveCutoff,
  getFinancialArchiveCutoff,
} from '@/lib/utils/archive';

export const ARCHIVE_BATCH_SIZE = 1000;

/** Both cutoffs, computed once per run so every step agrees on "now". */
export interface ArchiveCutoffs {
  /** Attendance and subscriptions: 1 year. */
  attendanceSubscription: Date;
  /** Financial records: 5 years (tax and audit). */
  financial: Date;
}

/**
 * One archive step. Returns the ids it moved in this batch; the runner repeats
 * it until a batch comes back smaller than ARCHIVE_BATCH_SIZE.
 */
export interface ArchiveStep {
  name: string;
  runBatch: (tx: TransactionClient, cutoffs: ArchiveCutoffs) => Promise<number>;
}

/** Thrown at the end of a run in which at least one step failed. */
export class ArchiveJobError extends Error {
  constructor(
    tenantId: string,
    readonly failedSteps: string[]
  ) {
    super(
      `[archive-job] ${failedSteps.length} step(s) failed for tenant ${tenantId}: ` +
        `${failedSteps.join(', ')}. The other steps completed; see Sentry for each error.`
    );
    this.name = 'ArchiveJobError';
  }
}

// ─── Ledger rows ────────────────────────────────────────────

/** Move ledger rows by id. */
async function moveLedgerRows(tx: TransactionClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.$executeRaw`
    INSERT INTO archived_financial_transactions
      (id, branch_id, type, amount, description, reference_id, date, created_by, created_at, archived_at)
    SELECT
      id, branch_id, type, amount, description, reference_id, date, created_by, created_at, NOW()
    FROM financial_transactions
    WHERE id = ANY(${ids}::uuid[])
    ON CONFLICT (id) DO NOTHING
  `;
  await tx.financialTransaction.deleteMany({ where: { id: { in: ids } } });
}

/** Move the ledger rows that mirror these sources (ledger.ts: one per source). */
async function moveLedgerMirrors(
  tx: TransactionClient,
  type: 'INCOME' | 'EXPENSE',
  sourceIds: string[]
): Promise<void> {
  if (sourceIds.length === 0) return;
  const mirrors = await tx.financialTransaction.findMany({
    where: { type, referenceId: { in: sourceIds } },
    select: { id: true },
  });
  await moveLedgerRows(
    tx,
    mirrors.map((m) => m.id)
  );
}

// ─── Steps, in the order they run ───────────────────────────

const archiveAttendance: ArchiveStep = {
  name: 'attendance',
  async runBatch(tx, cutoffs) {
    const rows = await tx.attendanceRecord.findMany({
      where: { createdAt: { lt: cutoffs.attendanceSubscription } },
      select: { id: true },
      take: ARCHIVE_BATCH_SIZE,
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return 0;

    await tx.$executeRaw`
      INSERT INTO archived_attendance_records
        (id, branch_id, session_id, trainee_id, status, is_retake, marked_at, marked_by, notes, created_at, updated_at, archived_at)
      SELECT
        id, branch_id, session_id, trainee_id, status, is_retake, marked_at, marked_by, notes, created_at, updated_at, NOW()
      FROM attendance_records
      WHERE id = ANY(${ids}::uuid[])
      ON CONFLICT (id) DO NOTHING
    `;
    await tx.attendanceRecord.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  },
};

/** Before subscriptions: a subscription can leave only once its receipts have. */
const archiveReceipts: ArchiveStep = {
  name: 'receipts',
  async runBatch(tx, cutoffs) {
    const rows = await tx.receipt.findMany({
      where: { createdAt: { lt: cutoffs.financial } },
      select: { id: true },
      take: ARCHIVE_BATCH_SIZE,
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return 0;

    // payment_method used to be dropped here: archived_receipts had no column
    // for it, on a record kept five years for tax and audit.
    await tx.$executeRaw`
      INSERT INTO archived_receipts
        (id, branch_id, trainee_id, subscription_id, receipt_number, seq, amount,
         payment_method, description, issued_at, created_at, archived_at)
      SELECT
        id, branch_id, trainee_id, subscription_id, receipt_number, seq, amount,
        payment_method, description, issued_at, created_at, NOW()
      FROM receipts
      WHERE id = ANY(${ids}::uuid[])
      ON CONFLICT (id) DO NOTHING
    `;
    await moveLedgerMirrors(tx, 'INCOME', ids);
    await tx.receipt.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  },
};

const archiveExpenses: ArchiveStep = {
  name: 'expenses',
  async runBatch(tx, cutoffs) {
    const rows = await tx.expense.findMany({
      where: { createdAt: { lt: cutoffs.financial } },
      select: { id: true },
      take: ARCHIVE_BATCH_SIZE,
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return 0;

    await tx.$executeRaw`
      INSERT INTO archived_expenses
        (id, branch_id, category, amount, date, description, created_by, created_at, updated_at, archived_at)
      SELECT
        id, branch_id, category, amount, date, description, created_by, created_at, updated_at, NOW()
      FROM expenses
      WHERE id = ANY(${ids}::uuid[])
      ON CONFLICT (id) DO NOTHING
    `;
    await moveLedgerMirrors(tx, 'EXPENSE', ids);
    await tx.expense.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  },
};

/** Manual income had no archive table: its ledger rows left after five years, it never did. */
const archiveManualIncomes: ArchiveStep = {
  name: 'manual-incomes',
  async runBatch(tx, cutoffs) {
    const rows = await tx.manualIncome.findMany({
      where: { createdAt: { lt: cutoffs.financial } },
      select: { id: true },
      take: ARCHIVE_BATCH_SIZE,
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return 0;

    await tx.$executeRaw`
      INSERT INTO archived_manual_incomes
        (id, branch_id, category, amount, date, description, created_by, created_at, updated_at, archived_at)
      SELECT
        id, branch_id, category, amount, date, description, created_by, created_at, updated_at, NOW()
      FROM manual_incomes
      WHERE id = ANY(${ids}::uuid[])
      ON CONFLICT (id) DO NOTHING
    `;
    await moveLedgerMirrors(tx, 'INCOME', ids);
    await tx.manualIncome.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  },
};

const archivePayrolls: ArchiveStep = {
  name: 'payrolls',
  async runBatch(tx, cutoffs) {
    // Never an unpaid payroll: only paid ones past the cutoff are eligible.
    const rows = await tx.captainPayroll.findMany({
      where: { isPaid: true, createdAt: { lt: cutoffs.financial } },
      select: { id: true },
      take: ARCHIVE_BATCH_SIZE,
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return 0;

    await tx.$executeRaw`
      INSERT INTO archived_captain_payrolls
        (id, branch_id, captain_id, period_start, period_end, payroll_type,
         hours_worked, hourly_rate, base_salary, percentage, percentage_base,
         total_amount, is_paid, paid_at, created_at, updated_at, archived_at)
      SELECT
        id, branch_id, captain_id, period_start, period_end, payroll_type,
        hours_worked, hourly_rate, base_salary, percentage, percentage_base,
        total_amount, is_paid, paid_at, created_at, updated_at, NOW()
      FROM captain_payrolls
      WHERE id = ANY(${ids}::uuid[])
      ON CONFLICT (id) DO NOTHING
    `;
    await moveLedgerMirrors(tx, 'EXPENSE', ids);
    await tx.captainPayroll.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  },
};

/** After receipts, so the receipts of an old subscription have already left. */
const archiveSubscriptions: ArchiveStep = {
  name: 'subscriptions',
  async runBatch(tx, cutoffs) {
    const rows = await tx.traineeSubscription.findMany({
      where: {
        status: 'EXPIRED',
        endDate: { lt: cutoffs.attendanceSubscription },
        // The foreign key: a subscription a live receipt points at stays live.
        receipts: { none: {} },
      },
      select: { id: true },
      take: ARCHIVE_BATCH_SIZE,
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return 0;

    // trainee_subscriptions has no branch_id/group_id column — branch is
    // reached via trainee_id → trainee_profiles.branch_id, and group
    // membership lives in the separate group_trainees join table.
    await tx.$executeRaw`
      INSERT INTO archived_trainee_subscriptions
        (id, trainee_id, plan_id, level_id, status, start_date, end_date,
         total_sessions, attended_sessions, freeze_used, amount_paid, amount_due,
         payment_status, expired_at, created_at, updated_at, archived_at)
      SELECT
        id, trainee_id, plan_id, level_id, status, start_date, end_date,
        total_sessions, attended_sessions, freeze_used, amount_paid, amount_due,
        payment_status, expired_at, created_at, updated_at, NOW()
      FROM trainee_subscriptions
      WHERE id = ANY(${ids}::uuid[])
      ON CONFLICT (id) DO NOTHING
    `;
    await tx.traineeSubscription.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  },
};

/**
 * Last: ledger rows past the cutoff that no live source points at (their
 * source is gone, or they never had one). A row whose source is still live is
 * left alone, so this step can never split a pair.
 */
const archiveLedgerLeftovers: ArchiveStep = {
  name: 'ledger',
  async runBatch(tx, cutoffs) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT f.id::text AS id
      FROM financial_transactions f
      WHERE f.created_at < ${cutoffs.financial}
        AND (
          f.reference_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM receipts r WHERE r.id = f.reference_id
            UNION ALL SELECT 1 FROM expenses e WHERE e.id = f.reference_id
            UNION ALL SELECT 1 FROM manual_incomes m WHERE m.id = f.reference_id
            UNION ALL SELECT 1 FROM captain_payrolls p WHERE p.id = f.reference_id
          )
        )
      LIMIT ${ARCHIVE_BATCH_SIZE}
    `;
    const ids = rows.map((r) => r.id);
    await moveLedgerRows(tx, ids);
    return ids.length;
  },
};

/** In order. Receipts before subscriptions is load-bearing; see the header. */
export const ARCHIVE_STEPS: readonly ArchiveStep[] = [
  archiveAttendance,
  archiveReceipts,
  archiveExpenses,
  archiveManualIncomes,
  archivePayrolls,
  archiveSubscriptions,
  archiveLedgerLeftovers,
];

// ─── Runner ─────────────────────────────────────────────────

/**
 * Run `steps` for one academy. Each step is isolated: its failure is reported
 * and logged, and the next step runs regardless. Throws ArchiveJobError at the
 * end if any step failed. Exported with `steps` as a parameter for tests.
 */
export async function runArchiveSteps(
  tenantId: string,
  steps: readonly ArchiveStep[],
  cutoffs: ArchiveCutoffs
): Promise<Record<string, number>> {
  const moved: Record<string, number> = {};
  const failed: string[] = [];

  for (const step of steps) {
    moved[step.name] = 0;
    try {
      for (;;) {
        const count = await withTenantContext(tenantId, (tx) => step.runBatch(tx, cutoffs), {
          timeout: 120_000,
        });
        moved[step.name] += count;
        if (count < ARCHIVE_BATCH_SIZE) break;
      }
      if (moved[step.name] > 0) {
        console.log(`[archive-job] ${step.name}: archived ${moved[step.name]} for tenant ${tenantId}`);
      }
    } catch (err) {
      failed.push(step.name);
      console.error(`[archive-job] ${step.name} failed for tenant ${tenantId}:`, err);
      Sentry.captureException(err, {
        tags: { job: 'archive-records', step: step.name, tenantId },
      });
    }
  }

  if (failed.length > 0) throw new ArchiveJobError(tenantId, failed);
  return moved;
}

export async function runArchiveJob(tenantId: string): Promise<void> {
  console.log(`[archive-job] Starting for tenant ${tenantId}`);
  await runArchiveSteps(tenantId, ARCHIVE_STEPS, {
    attendanceSubscription: getAttendanceSubscriptionArchiveCutoff(),
    financial: getFinancialArchiveCutoff(),
  });
  console.log(`[archive-job] Completed for tenant ${tenantId}`);
}
