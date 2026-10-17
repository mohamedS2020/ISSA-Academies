/**
 * Money is added up exactly — hardening plan §30.
 *
 * Totals used to load every ledger row and add the amounts as JavaScript
 * floats: ten payments of 0.10 came to 0.9999999999999999, and income 1.00
 * minus expenses 0.70 to 0.30000000000000004. Postgres now does the adding in
 * exact decimals, and differences go through Decimal too.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { getDashboardSummary } from '@/services/finance.service';
import { getFinancialReport } from '@/services/report.service';
import { recordLedgerEntry } from '@/services/ledger';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import {
  provisionTestAcademy,
  destroyTestAcademy,
  type TestAcademy,
} from '../helpers/test-academy';

let academy: TestAcademy | null = null;
const DAY = new Date('2026-03-15T00:00:00Z');
const FROM = new Date('2026-03-01T00:00:00Z');
const TO = new Date('2026-03-31T00:00:00Z');

beforeAll(async () => {
  academy = await provisionTestAcademy('money');
  const a = academy;
  await withTenantContext(a.tenantId, async (tx) => {
    for (let i = 0; i < 10; i++) {
      await recordLedgerEntry(tx, {
        branchId: a.branchId, type: 'INCOME', referenceId: crypto.randomUUID(),
        amount: 0.1, date: DAY, description: 'ten cents', createdBy: a.adminId,
      });
    }
    await recordLedgerEntry(tx, {
      branchId: a.branchId, type: 'EXPENSE', referenceId: crypto.randomUUID(),
      amount: 0.7, date: DAY, description: 'seventy cents', createdBy: a.adminId,
    });
  });
}, 120_000);

afterAll(async () => {
  try {
    await destroyTestAcademy(academy);
  } finally {
    await platformPrisma.$disconnect();
  }
});

describe('money totals are exact', () => {
  test('the finance dashboard', async () => {
    const a = academy!;
    const summary = await getDashboardSummary(a.tenantId, a.branchId, FROM, TO);
    expect(summary.totalIncome).toBe(1); // was 0.9999999999999999
    expect(summary.totalExpenses).toBe(0.7);
    expect(summary.netProfit).toBe(0.3); // was 0.30000000000000004
    expect(summary.series).toEqual([{ date: '2026-03-15', income: 1, expenses: 0.7 }]);
  }, 60_000);

  test('the financial report', async () => {
    const a = academy!;
    const report = await getFinancialReport(a.tenantId, a.branchId, FROM, TO);
    expect(report.summary.revenue).toBe(1);
    expect(report.summary.profitLoss).toBe(0.3);
  }, 60_000);
});
