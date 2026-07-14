/**
 * ISSA — Captain Payroll Service
 *
 * Two payroll modes (per CaptainProfile.payrollType):
 *   - HOURS: hoursWorked (auto-calculated from COMPLETED sessions in the
 *     period, for the captain's groups) × hourlyRate.
 *   - SALARY_PERCENTAGE: baseSalary + (percentage / 100 × percentageBase),
 *     where percentageBase = sum of Receipt.amount issued within the
 *     period for trainees in the captain's groups.
 *
 * `calculatePayrollPreview` never persists — it's a read-only computation
 * the Admin can review/override before calling `recordPayroll`.
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { writeAuditLog } from './audit.service';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '@/lib/api/error-handler';
import { AuditAction } from '@/types';
import type {
  RecordPayrollInput,
  ListPayrollsQuery,
} from '@/schemas/finance.schema';

// ─── Types ──────────────────────────────────────────────────

export interface PayrollPreview {
  captainId: string;
  captainName: string;
  payrollType: string;
  periodStart: string;
  periodEnd: string;
  hoursWorked?: number;
  hourlyRate?: number;
  baseSalary?: number;
  percentage?: number;
  percentageBase?: number;
  totalAmount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toPeriodRange(periodStart: string, periodEnd: string) {
  return {
    periodStartDate: new Date(`${periodStart}T00:00:00.000Z`),
    periodEndDate: new Date(`${periodEnd}T23:59:59.999Z`),
  };
}

// ─── Calculate Preview (no persistence) ────────────────────────

export async function calculatePayrollPreview(
  tenantId: string,
  branchId: string,
  captainId: string,
  periodStart: string,
  periodEnd: string
): Promise<PayrollPreview> {
  return withTenantContext(tenantId, async (tx) => {
    const captain = await tx.captainProfile.findFirst({
      where: { id: captainId, branchId },
      include: {
        user: { select: { name: true } },
        groups: { select: { id: true } },
      },
    });
    if (!captain) throw new NotFoundError('Captain not found in this branch');

    const groupIds = captain.groups.map((g) => g.id);
    const { periodStartDate, periodEndDate } = toPeriodRange(periodStart, periodEnd);

    if (captain.payrollType === 'HOURS') {
      const sessions = groupIds.length
        ? await tx.session.findMany({
            where: {
              branchId,
              groupId: { in: groupIds },
              status: 'COMPLETED',
              scheduledAt: { gte: periodStartDate, lte: periodEndDate },
            },
            select: { durationMinutes: true },
          })
        : [];

      const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
      const hoursWorked = round2(totalMinutes / 60);
      const hourlyRate = Number(captain.hourlyRate ?? 0);
      const totalAmount = round2(hoursWorked * hourlyRate);

      return {
        captainId: captain.id,
        captainName: captain.user.name,
        payrollType: captain.payrollType,
        periodStart,
        periodEnd,
        hoursWorked,
        hourlyRate,
        totalAmount,
      };
    }

    // SALARY_PERCENTAGE — percentageBase is the sum of Receipt.amount for
    // receipts issued within the period, for trainees in the captain's groups.
    const traineeIds = groupIds.length
      ? (
          await tx.groupTrainee.findMany({
            where: { groupId: { in: groupIds } },
            select: { traineeId: true },
            distinct: ['traineeId'],
          })
        ).map((g) => g.traineeId)
      : [];

    const receipts = traineeIds.length
      ? await tx.receipt.findMany({
          where: {
            branchId,
            traineeId: { in: traineeIds },
            issuedAt: { gte: periodStartDate, lte: periodEndDate },
          },
          select: { amount: true },
        })
      : [];

    const percentageBase = round2(
      receipts.reduce((sum, r) => sum + Number(r.amount), 0)
    );
    const baseSalary = Number(captain.baseSalary ?? 0);
    const percentage = Number(captain.percentage ?? 0);
    const totalAmount = round2(baseSalary + (percentage / 100) * percentageBase);

    return {
      captainId: captain.id,
      captainName: captain.user.name,
      payrollType: captain.payrollType,
      periodStart,
      periodEnd,
      baseSalary,
      percentage,
      percentageBase,
      totalAmount,
    };
  });
}

// ─── Record Payroll ─────────────────────────────────────────

export async function recordPayroll(
  tenantId: string,
  branchId: string,
  executorId: string,
  input: RecordPayrollInput
) {
  return withTenantContext(tenantId, async (tx) => {
    const captain = await tx.captainProfile.findFirst({
      where: { id: input.captainId, branchId },
      select: {
        id: true,
        payrollType: true,
        hourlyRate: true,
        baseSalary: true,
        percentage: true,
      },
    });
    if (!captain) throw new NotFoundError('Captain not found in this branch');

    const { periodStartDate, periodEndDate } = toPeriodRange(
      input.periodStart,
      input.periodEnd
    );

    // Overlap check + insert in the SAME tx — prevents double-paying a
    // captain for the same period under concurrent requests.
    const overlapping = await tx.captainPayroll.findFirst({
      where: {
        branchId,
        captainId: input.captainId,
        periodStart: { lte: periodEndDate },
        periodEnd: { gte: periodStartDate },
      },
    });
    if (overlapping) {
      throw new ConflictError(
        'A payroll record already exists for an overlapping period'
      );
    }

    const payroll = await tx.captainPayroll.create({
      data: {
        branchId,
        captainId: input.captainId,
        periodStart: periodStartDate,
        periodEnd: periodEndDate,
        payrollType: captain.payrollType,
        hoursWorked: input.hoursWorked ?? null,
        hourlyRate: captain.hourlyRate,
        baseSalary: captain.baseSalary,
        percentage: captain.percentage,
        percentageBase: input.percentageBase ?? null,
        totalAmount: input.totalAmount,
        isPaid: false,
      },
    });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.CREATE,
      entityType: 'CaptainPayroll',
      entityId: payroll.id,
      newValues: payroll as unknown as Record<string, unknown>,
    });

    return payroll;
  });
}

// ─── Mark Paid ──────────────────────────────────────────────

export async function markPayrollPaid(
  tenantId: string,
  branchId: string,
  id: string,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const existing = await tx.captainPayroll.findFirst({
      where: { id, branchId },
      include: { captain: { select: { user: { select: { name: true } } } } },
    });
    if (!existing) throw new NotFoundError('Payroll record not found');
    if (existing.isPaid) {
      throw new BadRequestError('Payroll is already marked as paid');
    }

    const paidAt = new Date();
    const updated = await tx.captainPayroll.update({
      where: { id },
      data: { isPaid: true, paidAt },
    });

    // Paying a payroll is money leaving the branch — mirror it into the
    // financial ledger as an EXPENSE so it flows into the financial report
    // (expense total + profit/loss), exactly like createExpense does for
    // manual expenses. The isPaid guard above keeps this from double-posting.
    const periodStart = existing.periodStart.toISOString().slice(0, 10);
    const periodEnd = existing.periodEnd.toISOString().slice(0, 10);
    await tx.financialTransaction.create({
      data: {
        branchId,
        type: 'EXPENSE',
        amount: existing.totalAmount,
        description: `Payroll: ${existing.captain.user.name} (${periodStart} – ${periodEnd})`,
        referenceId: id,
        date: paidAt,
        createdBy: executorId,
      },
    });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'CaptainPayroll',
      entityId: id,
      oldValues: { isPaid: false },
      newValues: { isPaid: true, paidAt: updated.paidAt },
    });

    return updated;
  });
}

// ─── List Payrolls ────────────────────────────────────────────

export async function listPayrolls(
  tenantId: string,
  branchId: string,
  query: ListPayrollsQuery
) {
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { branchId };
  if (query.captainId) where.captainId = query.captainId;
  if (query.periodStart) where.periodStart = { gte: new Date(query.periodStart) };
  if (query.periodEnd) where.periodEnd = { lte: new Date(query.periodEnd) };

  return withTenantContext(tenantId, async (tx) => {
    const [payrolls, total] = await Promise.all([
      tx.captainPayroll.findMany({
        where,
        skip,
        take: limit,
        orderBy: { periodStart: 'desc' },
        include: {
          captain: { select: { user: { select: { name: true } } } },
        },
      }),
      tx.captainPayroll.count({ where }),
    ]);

    return {
      payrolls,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });
}
