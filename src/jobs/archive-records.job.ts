/**
 * ISSA — Archive Records Job
 *
 * Weekly job: moves old records to archived_* tables per retention policy.
 *
 * Retention rules:
 *   - AttendanceRecord + TraineeSubscription: inactive > 1 year
 *   - FinancialTransaction + Receipt + Expense + CaptainPayroll (paid only): > 5 years
 *
 * ⚠️ ID-CAPTURE PATTERN: IDs are captured from the SELECT, then that exact
 *    set is used for the DELETE. The DELETE never re-runs the WHERE clause.
 *    If it did, records inserted between the INSERT and DELETE would be
 *    deleted without being archived — silent, unrecoverable data loss.
 *    Both passes are inside a single $transaction.
 *
 * ⚠️ Raw SQL column lists below were fixed to match the actual table
 *    columns (task 8) — the original `archived_trainee_subscriptions` and
 *    `archived_receipts` inserts referenced columns that never existed
 *    (`branch_id`/`group_id` on trainee_subscriptions; `paid_amount`,
 *    `payment_status`, `plan_name`, `level_name`, `branch_code`,
 *    `updated_at` on receipts) and would have thrown a Postgres
 *    "column does not exist" error the first time this job ran against
 *    qualifying data.
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import {
  getAttendanceSubscriptionArchiveCutoff,
  getFinancialArchiveCutoff,
} from '@/lib/utils/archive';

async function archiveAttendanceRecords(tenantId: string): Promise<void> {
  const cutoff = getAttendanceSubscriptionArchiveCutoff();

  await withTenantContext(tenantId, async (tx) => {
    // ✅ Step 1: Capture IDs
    const rows = await tx.attendanceRecord.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
    });

    const ids = rows.map((r: { id: string }) => r.id);
    if (ids.length === 0) return;

    // ✅ Step 2: INSERT into archive using the captured IDs
    await tx.$executeRaw`
      INSERT INTO archived_attendance_records
        (id, branch_id, session_id, trainee_id, status, is_retake, marked_at, marked_by, notes, created_at, updated_at, archived_at)
      SELECT
        id, branch_id, session_id, trainee_id, status, is_retake, marked_at, marked_by, notes, created_at, updated_at, NOW()
      FROM attendance_records
      WHERE id = ANY(${ids}::uuid[])
      ON CONFLICT (id) DO NOTHING
    `;

    // ✅ Step 3: DELETE using the same captured IDs — never re-run WHERE
    await tx.attendanceRecord.deleteMany({
      where: { id: { in: ids } },
    });

    console.log(`[archive-job] Archived ${ids.length} attendance records for tenant ${tenantId}`);
  });
}

async function archiveExpiredSubscriptions(tenantId: string): Promise<void> {
  const cutoff = getAttendanceSubscriptionArchiveCutoff();

  await withTenantContext(tenantId, async (tx) => {
    const rows = await tx.traineeSubscription.findMany({
      where: {
        status: 'EXPIRED',
        endDate: { lt: cutoff },
      },
      select: { id: true },
    });

    const ids = rows.map((r: { id: string }) => r.id);
    if (ids.length === 0) return;

    // trainee_subscriptions has no branch_id/group_id column — branch is
    // reached via trainee_id → trainee_profiles.branch_id, and group
    // membership lives in the separate group_trainees join table.
    await tx.$executeRaw`
      INSERT INTO archived_trainee_subscriptions
        (id, trainee_id, plan_id, level_id, status, start_date, end_date,
         total_sessions, attended_sessions, freeze_used, amount_paid, amount_due,
         payment_status, created_at, updated_at, archived_at)
      SELECT
        id, trainee_id, plan_id, level_id, status, start_date, end_date,
        total_sessions, attended_sessions, freeze_used, amount_paid, amount_due,
        payment_status, created_at, updated_at, NOW()
      FROM trainee_subscriptions
      WHERE id = ANY(${ids}::uuid[])
      ON CONFLICT (id) DO NOTHING
    `;

    await tx.traineeSubscription.deleteMany({
      where: { id: { in: ids } },
    });

    console.log(`[archive-job] Archived ${ids.length} subscriptions for tenant ${tenantId}`);
  });
}

async function archiveFinancialRecords(tenantId: string): Promise<void> {
  // Financial records: 5 years minimum (tax/audit compliance — FR-FN-09)
  const cutoff = getFinancialArchiveCutoff();

  await withTenantContext(tenantId, async (tx) => {
    // Archive receipts
    const receiptRows = await tx.receipt.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
    });
    const receiptIds = receiptRows.map((r: { id: string }) => r.id);

    if (receiptIds.length > 0) {
      await tx.$executeRaw`
        INSERT INTO archived_receipts
          (id, branch_id, trainee_id, subscription_id, receipt_number, seq, amount,
           description, issued_at, created_at, archived_at)
        SELECT
          id, branch_id, trainee_id, subscription_id, receipt_number, seq, amount,
          description, issued_at, created_at, NOW()
        FROM receipts
        WHERE id = ANY(${receiptIds}::uuid[])
        ON CONFLICT (id) DO NOTHING
      `;
      await tx.receipt.deleteMany({ where: { id: { in: receiptIds } } });
      console.log(`[archive-job] Archived ${receiptIds.length} receipts for tenant ${tenantId}`);
    }

    // Archive expenses
    const expenseRows = await tx.expense.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
    });
    const expenseIds = expenseRows.map((r: { id: string }) => r.id);

    if (expenseIds.length > 0) {
      await tx.$executeRaw`
        INSERT INTO archived_expenses
          (id, branch_id, category, amount, date, description, created_by, created_at, updated_at, archived_at)
        SELECT
          id, branch_id, category, amount, date, description, created_by, created_at, updated_at, NOW()
        FROM expenses
        WHERE id = ANY(${expenseIds}::uuid[])
        ON CONFLICT (id) DO NOTHING
      `;
      await tx.expense.deleteMany({ where: { id: { in: expenseIds } } });
      console.log(`[archive-job] Archived ${expenseIds.length} expenses for tenant ${tenantId}`);
    }
  });
}

async function archiveFinancialTransactions(tenantId: string): Promise<void> {
  const cutoff = getFinancialArchiveCutoff();

  await withTenantContext(tenantId, async (tx) => {
    const rows = await tx.financialTransaction.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
    });
    const ids = rows.map((r: { id: string }) => r.id);
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
    console.log(`[archive-job] Archived ${ids.length} financial transactions for tenant ${tenantId}`);
  });
}

async function archiveCaptainPayrolls(tenantId: string): Promise<void> {
  const cutoff = getFinancialArchiveCutoff();

  await withTenantContext(tenantId, async (tx) => {
    // Never archive an unpaid/pending payroll record — only isPaid ones
    // past the retention cutoff are eligible.
    const rows = await tx.captainPayroll.findMany({
      where: { isPaid: true, createdAt: { lt: cutoff } },
      select: { id: true },
    });
    const ids = rows.map((r: { id: string }) => r.id);
    if (ids.length === 0) return;

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

    await tx.captainPayroll.deleteMany({ where: { id: { in: ids } } });
    console.log(`[archive-job] Archived ${ids.length} captain payrolls for tenant ${tenantId}`);
  });
}

export async function runArchiveJob(tenantId: string): Promise<void> {
  console.log(`[archive-job] Starting for tenant ${tenantId}`);
  try {
    await archiveAttendanceRecords(tenantId);
    await archiveExpiredSubscriptions(tenantId);
    await archiveFinancialRecords(tenantId);
    await archiveFinancialTransactions(tenantId);
    await archiveCaptainPayrolls(tenantId);
    console.log(`[archive-job] Completed for tenant ${tenantId}`);
  } catch (err) {
    console.error(`[archive-job] Error for tenant ${tenantId}:`, err);
  }
}
