/**
 * ISSA — Backfill Payroll Expenses
 *
 * Paid captain payrolls only started mirroring into the financial ledger (as
 * an EXPENSE FinancialTransaction) once `markPayrollPaid` was updated to post
 * one. Payrolls marked paid BEFORE that change have `isPaid = true` but no
 * matching ledger entry, so they don't show in the Financial Dashboard's
 * expense total / chart or the financial report.
 *
 * This script creates the missing EXPENSE transaction for every already-paid
 * payroll across all ACTIVE tenants. It is IDEMPOTENT — a payroll that already
 * has a mirrored transaction (referenceId = payroll id) is skipped — so it is
 * safe to re-run.
 *
 *   npx tsx scripts/backfill-payroll-expenses.ts
 */

import { platformPrisma } from '../src/lib/db/platform-client';
import { withTenantContext } from '../src/lib/db/tenant-client';

// No real executor for a historical backfill — use the nil UUID as a clear
// "system" marker (FinancialTransaction.createdBy has no FK).
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';

async function backfillTenant(tenantId: string): Promise<number> {
  return withTenantContext(tenantId, async (tx) => {
    const paid = await tx.captainPayroll.findMany({
      where: { isPaid: true },
      include: { captain: { select: { user: { select: { name: true } } } } },
    });
    if (paid.length === 0) return 0;

    const linked = await tx.financialTransaction.findMany({
      where: { type: 'EXPENSE', referenceId: { in: paid.map((p) => p.id) } },
      select: { referenceId: true },
    });
    const linkedIds = new Set(linked.map((l) => l.referenceId));

    let created = 0;
    for (const p of paid) {
      if (linkedIds.has(p.id)) continue;
      const periodStart = p.periodStart.toISOString().slice(0, 10);
      const periodEnd = p.periodEnd.toISOString().slice(0, 10);
      await tx.financialTransaction.create({
        data: {
          branchId: p.branchId,
          type: 'EXPENSE',
          amount: p.totalAmount,
          description: `Payroll: ${p.captain.user.name} (${periodStart} – ${periodEnd})`,
          referenceId: p.id,
          date: p.paidAt ?? p.updatedAt,
          createdBy: SYSTEM_USER,
        },
      });
      created++;
    }
    return created;
  });
}

async function main() {
  const tenants = await platformPrisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, schemaName: true },
    orderBy: { createdAt: 'asc' },
  });

  let total = 0;
  for (const t of tenants) {
    const created = await backfillTenant(t.id);
    console.log(`  ${t.schemaName}: backfilled ${created} payroll expense(s)`);
    total += created;
  }
  console.log(`\nDone. ${total} payroll expense transaction(s) created across ${tenants.length} tenant(s).`);
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exitCode = 1;
  })
  .finally(() => platformPrisma.$disconnect());
