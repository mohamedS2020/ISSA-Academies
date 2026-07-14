/**
 * ISSA — Finance Service
 *
 * Handles expense CRUD (mirrored into FinancialTransaction for P&L),
 * income/expense aggregation, and the Financial Dashboard summary.
 *
 * ⚠️ Financial records archive after 5 years (not 1 year — that's
 *    attendance/subscriptions). See src/lib/utils/archive.ts.
 *
 * ⚠️ TraineeSubscription has no direct branchId column — branch scope
 *    must go through the trainee relation (`trainee: { branchId }`).
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { writeAuditLog, buildAuditDiff } from './audit.service';
import { NotFoundError } from '@/lib/api/error-handler';
import { AuditAction } from '@/types';
import {
  getFinancialArchiveCutoff,
  rangeSpansArchive,
} from '@/lib/utils/archive';
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesQuery,
  CreateManualIncomeInput,
  UpdateManualIncomeInput,
  ListManualIncomeQuery,
} from '@/schemas/finance.schema';

// ─── Types ──────────────────────────────────────────────────

export interface FinanceSeriesPoint {
  date: string; // YYYY-MM-DD
  amount: number;
}

export interface FinanceTotals {
  total: number;
  series: FinanceSeriesPoint[];
}

// ─── Create Expense ─────────────────────────────────────────

export async function createExpense(
  tenantId: string,
  branchId: string,
  executorId: string,
  input: CreateExpenseInput
) {
  return withTenantContext(tenantId, async (tx) => {
    const expense = await tx.expense.create({
      data: {
        branchId,
        category: input.category,
        amount: input.amount,
        date: new Date(input.date),
        description: input.description ?? null,
        createdBy: executorId,
      },
    });

    // Mirror into FinancialTransaction so P&L/income-expense aggregation
    // has one consistent source — same pattern as enrollment's INCOME mirror.
    await tx.financialTransaction.create({
      data: {
        branchId,
        type: 'EXPENSE',
        amount: input.amount,
        description: `Expense: ${input.category}`,
        referenceId: expense.id,
        date: expense.date,
        createdBy: executorId,
      },
    });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.CREATE,
      entityType: 'Expense',
      entityId: expense.id,
      newValues: expense as unknown as Record<string, unknown>,
    });

    return expense;
  });
}

// ─── List Expenses ────────────────────────────────────────────

export async function listExpenses(
  tenantId: string,
  branchId: string,
  query: ListExpensesQuery
) {
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { branchId };
  if (query.category) where.category = query.category;
  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
  }

  return withTenantContext(tenantId, async (tx) => {
    const [expenses, total] = await Promise.all([
      tx.expense.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      tx.expense.count({ where }),
    ]);

    return {
      expenses,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });
}

// ─── Update Expense ───────────────────────────────────────────

export async function updateExpense(
  tenantId: string,
  branchId: string,
  id: string,
  input: UpdateExpenseInput,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const existing = await tx.expense.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundError('Expense not found');

    const updated = await tx.expense.update({
      where: { id },
      data: {
        ...(input.category !== undefined && { category: input.category }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.date !== undefined && { date: new Date(input.date) }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });

    const diff = buildAuditDiff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>
    );
    if (diff) {
      await writeAuditLog(tx, {
        branchId,
        userId: executorId,
        action: AuditAction.UPDATE,
        entityType: 'Expense',
        entityId: id,
        oldValues: diff.old,
        newValues: diff.new,
      });
    }

    return updated;
  });
}

// ─── Delete Expense ───────────────────────────────────────────

export async function deleteExpense(
  tenantId: string,
  branchId: string,
  id: string,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const existing = await tx.expense.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundError('Expense not found');

    // Remove the mirrored FinancialTransaction so P&L stays consistent.
    await tx.financialTransaction.deleteMany({
      where: { branchId, type: 'EXPENSE', referenceId: id },
    });

    await tx.expense.delete({ where: { id } });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.DELETE,
      entityType: 'Expense',
      entityId: id,
      oldValues: existing as unknown as Record<string, unknown>,
    });
  });
}

// ─── Manual Income (income NOT tied to a subscription) ────────
//
// Mirrors the Expense pattern: each ManualIncome row also writes an INCOME
// FinancialTransaction so the dashboard/P&L income totals (which sum INCOME
// transactions) include it automatically alongside subscription payments.

export async function createManualIncome(
  tenantId: string,
  branchId: string,
  executorId: string,
  input: CreateManualIncomeInput
) {
  return withTenantContext(tenantId, async (tx) => {
    const income = await tx.manualIncome.create({
      data: {
        branchId,
        category: input.category,
        amount: input.amount,
        date: new Date(input.date),
        description: input.description ?? null,
        createdBy: executorId,
      },
    });

    await tx.financialTransaction.create({
      data: {
        branchId,
        type: 'INCOME',
        amount: input.amount,
        description: `Income: ${input.category}`,
        referenceId: income.id,
        date: income.date,
        createdBy: executorId,
      },
    });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.CREATE,
      entityType: 'ManualIncome',
      entityId: income.id,
      newValues: income as unknown as Record<string, unknown>,
    });

    return income;
  });
}

export async function listManualIncome(
  tenantId: string,
  branchId: string,
  query: ListManualIncomeQuery
) {
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { branchId };
  if (query.category) where.category = query.category;
  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
  }

  return withTenantContext(tenantId, async (tx) => {
    const [incomes, total] = await Promise.all([
      tx.manualIncome.findMany({ where, skip, take: limit, orderBy: { date: 'desc' } }),
      tx.manualIncome.count({ where }),
    ]);

    return {
      incomes,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });
}

export async function updateManualIncome(
  tenantId: string,
  branchId: string,
  id: string,
  input: UpdateManualIncomeInput,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const existing = await tx.manualIncome.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundError('Income not found');

    const updated = await tx.manualIncome.update({
      where: { id },
      data: {
        ...(input.category !== undefined && { category: input.category }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.date !== undefined && { date: new Date(input.date) }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });

    // Keep the mirrored INCOME transaction in sync so P&L never drifts.
    await tx.financialTransaction.updateMany({
      where: { branchId, type: 'INCOME', referenceId: id },
      data: {
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.date !== undefined && { date: new Date(input.date) }),
        ...(input.category !== undefined && { description: `Income: ${input.category}` }),
      },
    });

    const diff = buildAuditDiff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>
    );
    if (diff) {
      await writeAuditLog(tx, {
        branchId,
        userId: executorId,
        action: AuditAction.UPDATE,
        entityType: 'ManualIncome',
        entityId: id,
        oldValues: diff.old,
        newValues: diff.new,
      });
    }

    return updated;
  });
}

export async function deleteManualIncome(
  tenantId: string,
  branchId: string,
  id: string,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const existing = await tx.manualIncome.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundError('Income not found');

    await tx.financialTransaction.deleteMany({
      where: { branchId, type: 'INCOME', referenceId: id },
    });

    await tx.manualIncome.delete({ where: { id } });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.DELETE,
      entityType: 'ManualIncome',
      entityId: id,
      oldValues: existing as unknown as Record<string, unknown>,
    });
  });
}

// ─── Income / Expense Aggregation (archive-aware) ─────────────

/**
 * Sum FinancialTransaction rows of a given type within a date range.
 * UNIONs the archived table when dateFrom predates the 5-year cutoff.
 */
async function getFinancialTransactionTotals(
  tenantId: string,
  branchId: string,
  type: 'INCOME' | 'EXPENSE',
  dateFrom: Date,
  dateTo: Date
): Promise<FinanceTotals> {
  return withTenantContext(tenantId, async (tx) => {
    const live = await tx.financialTransaction.findMany({
      where: { branchId, type, date: { gte: dateFrom, lte: dateTo } },
      select: { amount: true, date: true },
    });

    let archived: { amount: unknown; date: Date }[] = [];
    if (rangeSpansArchive(dateFrom, getFinancialArchiveCutoff())) {
      archived = await tx.archivedFinancialTransaction.findMany({
        where: { branchId, type, date: { gte: dateFrom, lte: dateTo } },
        select: { amount: true, date: true },
      });
    }

    const all = [...live, ...archived];
    const total = all.reduce((sum, r) => sum + Number(r.amount), 0);

    const byDate = new Map<string, number>();
    for (const r of all) {
      const key = r.date.toISOString().slice(0, 10);
      byDate.set(key, (byDate.get(key) ?? 0) + Number(r.amount));
    }
    const series = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    return { total, series };
  });
}

export async function getIncomeSummary(
  tenantId: string,
  branchId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<FinanceTotals> {
  return getFinancialTransactionTotals(tenantId, branchId, 'INCOME', dateFrom, dateTo);
}

export async function getExpenseSummary(
  tenantId: string,
  branchId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<FinanceTotals> {
  return getFinancialTransactionTotals(tenantId, branchId, 'EXPENSE', dateFrom, dateTo);
}

/**
 * Sum of TraineeSubscription.amountDue for subscriptions not yet fully paid.
 * Always live-table only — outstanding balances are inherently current,
 * never archived (an archived subscription is, by definition, inactive).
 */
export async function getOutstandingBalance(
  tenantId: string,
  branchId: string
): Promise<number> {
  return withTenantContext(tenantId, async (tx) => {
    const result = await tx.traineeSubscription.aggregate({
      where: {
        paymentStatus: { not: 'PAID' },
        trainee: { branchId },
      },
      _sum: { amountDue: true },
    });
    return Number(result._sum.amountDue ?? 0);
  });
}

export interface DashboardSummary {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  outstandingBalances: number;
  series: { date: string; income: number; expenses: number }[];
}

export async function getDashboardSummary(
  tenantId: string,
  branchId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<DashboardSummary> {
  const [income, expense, outstandingBalances] = await Promise.all([
    getIncomeSummary(tenantId, branchId, dateFrom, dateTo),
    getExpenseSummary(tenantId, branchId, dateFrom, dateTo),
    getOutstandingBalance(tenantId, branchId),
  ]);

  const dates = new Set([
    ...income.series.map((p) => p.date),
    ...expense.series.map((p) => p.date),
  ]);
  const incomeMap = new Map(income.series.map((p) => [p.date, p.amount]));
  const expenseMap = new Map(expense.series.map((p) => [p.date, p.amount]));
  const series = Array.from(dates)
    .sort()
    .map((date) => ({
      date,
      income: incomeMap.get(date) ?? 0,
      expenses: expenseMap.get(date) ?? 0,
    }));

  return {
    totalIncome: income.total,
    totalExpenses: expense.total,
    netProfit: income.total - expense.total,
    outstandingBalances,
    series,
  };
}

// Exported for reuse by report.service.ts — same UNION logic, one source of truth.
export { getFinancialTransactionTotals };
