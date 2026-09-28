/**
 * Ledger integrity — hardening plan §24.
 *
 * The P&L sums the ledger (financial_transactions), not the source tables, so
 * every edit to an expense or income must reach its ledger mirror. It did not:
 * `updateExpense` changed the expense and never touched the ledger, so an edited
 * expense kept its OLD amount and its OLD month in every financial report.
 *
 * The final test in each group checks the thing a user actually sees — the
 * P&L total — not just the row, because that is where the bug surfaced.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  createExpense,
  updateExpense,
  deleteExpense,
  createManualIncome,
  updateManualIncome,
  getExpenseSummary,
  getIncomeSummary,
} from '@/services/finance.service';
import { updateLedgerEntry, LedgerIntegrityError } from '@/services/ledger';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { provisionTestAcademy, destroyTestAcademy, type TestAcademy } from '../helpers/test-academy';

let academy: TestAcademy | null = null;

beforeAll(async () => {
  academy = await provisionTestAcademy('ledger');
}, 120_000);

afterAll(async () => {
  try {
    await destroyTestAcademy(academy);
  } finally {
    await platformPrisma.$disconnect();
  }
});

const ledgerRow = (a: TestAcademy, referenceId: string, type: 'INCOME' | 'EXPENSE') =>
  withTenantContext(a.tenantId, (tx) =>
    tx.financialTransaction.findMany({
      where: { referenceId, type },
      select: { amount: true, date: true, description: true },
    })
  );

const day = (d: Date) => d.toISOString().slice(0, 10);

describe('expense edits reach the ledger', () => {
  test('editing the amount updates the ledger amount', async () => {
    const a = academy!;
    const expense = await createExpense(a.tenantId, a.branchId, a.adminId, {
      category: 'Rent', amount: 1000, date: '2026-09-01',
    });

    await updateExpense(a.tenantId, a.branchId, expense.id, { amount: 500 }, a.adminId);

    const rows = await ledgerRow(a, expense.id, 'EXPENSE');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(500);
  }, 60_000);

  test('editing the date moves the ledger entry to the new period', async () => {
    const a = academy!;
    const expense = await createExpense(a.tenantId, a.branchId, a.adminId, {
      category: 'Rent', amount: 750, date: '2026-09-01',
    });

    await updateExpense(a.tenantId, a.branchId, expense.id, { date: '2026-10-15' }, a.adminId);

    const [row] = await ledgerRow(a, expense.id, 'EXPENSE');
    expect(day(row.date)).toBe('2026-10-15');
  }, 60_000);

  test('editing the category updates the ledger description', async () => {
    const a = academy!;
    const expense = await createExpense(a.tenantId, a.branchId, a.adminId, {
      category: 'Rent', amount: 100, date: '2026-09-01',
    });

    await updateExpense(a.tenantId, a.branchId, expense.id, { category: 'Utilities' }, a.adminId);

    const [row] = await ledgerRow(a, expense.id, 'EXPENSE');
    expect(row.description).toBe('Expense: Utilities');
  }, 60_000);

  test('the P&L expense total reflects the edit — the number a user sees', async () => {
    const a = academy!;
    // A month nothing else in this suite touches, so the total is ours alone.
    const expense = await createExpense(a.tenantId, a.branchId, a.adminId, {
      category: 'Equipment', amount: 1000, date: '2025-03-10',
    });

    await updateExpense(
      a.tenantId, a.branchId, expense.id, { amount: 400, date: '2025-04-10' }, a.adminId
    );

    const march = await getExpenseSummary(
      a.tenantId, a.branchId, new Date('2025-03-01'), new Date('2025-03-31')
    );
    const april = await getExpenseSummary(
      a.tenantId, a.branchId, new Date('2025-04-01'), new Date('2025-04-30')
    );

    // Before the fix: March still showed 1000 and April showed nothing.
    expect(march.total).toBe(0);
    expect(april.total).toBe(400);
  }, 60_000);

  test('deleting an expense removes its ledger entry', async () => {
    const a = academy!;
    const expense = await createExpense(a.tenantId, a.branchId, a.adminId, {
      category: 'Misc', amount: 25, date: '2026-09-01',
    });

    await deleteExpense(a.tenantId, a.branchId, expense.id, a.adminId);

    expect(await ledgerRow(a, expense.id, 'EXPENSE')).toHaveLength(0);
  }, 60_000);
});

describe('manual income edits reach the ledger', () => {
  test('editing amount and date updates the ledger and the income total', async () => {
    const a = academy!;
    const income = await createManualIncome(a.tenantId, a.branchId, a.adminId, {
      category: 'Hall rental', amount: 300, date: '2025-06-05',
    });

    await updateManualIncome(
      a.tenantId, a.branchId, income.id, { amount: 350, date: '2025-07-05' }, a.adminId
    );

    const [row] = await ledgerRow(a, income.id, 'INCOME');
    expect(Number(row.amount)).toBe(350);
    expect(day(row.date)).toBe('2025-07-05');

    const july = await getIncomeSummary(
      a.tenantId, a.branchId, new Date('2025-07-01'), new Date('2025-07-31')
    );
    expect(july.total).toBe(350);
  }, 60_000);
});

describe('ledger integrity guard', () => {
  test('refuses an edit whose ledger mirror is missing, rather than leaving the books wrong', async () => {
    const a = academy!;
    const expense = await createExpense(a.tenantId, a.branchId, a.adminId, {
      category: 'Orphan', amount: 10, date: '2026-09-01',
    });

    // Simulate prior drift: the mirror vanished.
    await withTenantContext(a.tenantId, (tx) =>
      tx.financialTransaction.deleteMany({ where: { referenceId: expense.id } })
    );

    await expect(
      withTenantContext(a.tenantId, (tx) =>
        updateLedgerEntry(tx, { branchId: a.branchId, type: 'EXPENSE', referenceId: expense.id }, { amount: 20 })
      )
    ).rejects.toBeInstanceOf(LedgerIntegrityError);
  }, 60_000);

  test('an edit that changes nothing ledger-relevant is a no-op, even with no mirror', async () => {
    const a = academy!;
    await expect(
      withTenantContext(a.tenantId, (tx) =>
        updateLedgerEntry(tx, { branchId: a.branchId, type: 'EXPENSE', referenceId: a.branchId }, {})
      )
    ).resolves.toBeUndefined();
  }, 60_000);
});
