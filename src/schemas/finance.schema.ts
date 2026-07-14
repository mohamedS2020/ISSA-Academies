/**
 * ISSA — Finance & Reports Validation Schemas
 *
 * Covers: expenses, partial payments, captain payroll, and report queries.
 */

import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

// ─── Expenses ───────────────────────────────────────────────

export const createExpenseSchema = z.object({
  category: z.string().min(1, 'Category is required').max(100),
  amount: z.coerce.number().positive().max(9999999.99),
  date: isoDate,
  description: z.string().max(1000).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  amount: z.coerce.number().positive().max(9999999.99).optional(),
  date: isoDate.optional(),
  description: z.string().max(1000).optional().nullable(),
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const listExpensesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

// ─── Manual Income (not tied to a subscription) ─────────────

export const createManualIncomeSchema = z.object({
  category: z.string().min(1, 'Category is required').max(100),
  amount: z.coerce.number().positive().max(9999999.99),
  date: isoDate,
  description: z.string().max(1000).optional(),
});

export type CreateManualIncomeInput = z.infer<typeof createManualIncomeSchema>;

export const updateManualIncomeSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  amount: z.coerce.number().positive().max(9999999.99).optional(),
  date: isoDate.optional(),
  description: z.string().max(1000).optional().nullable(),
});

export type UpdateManualIncomeInput = z.infer<typeof updateManualIncomeSchema>;

export const listManualIncomeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export type ListManualIncomeQuery = z.infer<typeof listManualIncomeQuerySchema>;

// ─── Partial Payments ───────────────────────────────────────

/** How a payment was made — shared with enrollment/renewal receipts. */
export const PaymentMethodEnum = z.enum(['INSTAPAY', 'CASH', 'EWALLET']);

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive().max(9999999.99),
  paymentMethod: PaymentMethodEnum,
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ─── Payroll ────────────────────────────────────────────────

const payrollPeriodFields = {
  captainId: z.string().uuid('Invalid captain ID'),
  periodStart: isoDate,
  periodEnd: isoDate,
};

export const calculatePayrollQuerySchema = z
  .object(payrollPeriodFields)
  .superRefine((data, ctx) => {
    if (data.periodEnd < data.periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'periodEnd must be on or after periodStart',
        path: ['periodEnd'],
      });
    }
  });

export type CalculatePayrollQuery = z.infer<typeof calculatePayrollQuerySchema>;

export const recordPayrollSchema = z
  .object({
    ...payrollPeriodFields,
    // Admin-editable override of the auto-calculated preview values.
    hoursWorked: z.coerce.number().min(0).max(9999.99).optional(),
    percentageBase: z.coerce.number().min(0).max(9999999.99).optional(),
    totalAmount: z.coerce.number().positive().max(9999999.99),
  })
  .superRefine((data, ctx) => {
    if (data.periodEnd < data.periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'periodEnd must be on or after periodStart',
        path: ['periodEnd'],
      });
    }
  });

export type RecordPayrollInput = z.infer<typeof recordPayrollSchema>;

export const listPayrollsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  captainId: z.string().uuid().optional(),
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
});

export type ListPayrollsQuery = z.infer<typeof listPayrollsQuerySchema>;

// ─── Reports ────────────────────────────────────────────────

export const ReportTypeEnum = z.enum([
  'financial',
  'attendance',
  'subscription',
  'captainPerformance',
  'expiringSoon',
  'levelGroupTransitions',
]);

export const ReportFormatEnum = z.enum(['json', 'pdf', 'excel']);

export const reportQuerySchema = z
  .object({
    type: ReportTypeEnum,
    format: ReportFormatEnum.default('json'),
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    // Report-specific filters — validated per-type inside report.service.ts.
    planId: z.string().uuid().optional(),
    levelId: z.string().uuid().optional(),
    captainId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
    traineeId: z.string().uuid().optional(),
    status: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.dateFrom && data.dateTo && data.dateTo < data.dateFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateTo must be on or after dateFrom',
        path: ['dateTo'],
      });
    }
  });

export type ReportQuery = z.infer<typeof reportQuerySchema>;
