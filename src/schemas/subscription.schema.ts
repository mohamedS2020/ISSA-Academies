/**
 * ISSA — Subscription Plan & Enrollment Schemas
 *
 * ⚠️  periodDays is required when periodType === FROM_SUBSCRIPTION_DATE,
 *     and must be null/absent when FROM_MONTH_START.
 *     Enforced via superRefine — not just .optional().
 *
 * ⚠️  This file is SERVER-ONLY (imports from zod only — safe for client,
 *     but services import from here so keep it clean).
 */

import { z } from 'zod';
import { PaymentMethodEnum } from './finance.schema';

// ─── Enums ────────────────────────────────────────────────────

export const PeriodTypeEnum = z.enum(['FROM_SUBSCRIPTION_DATE', 'FROM_MONTH_START']);
export const PaymentStatusEnum = z.enum(['PAID', 'PARTIAL', 'UNPAID']);

// ─── Subscription Plan Level ─────────────────────────────────

export const planLevelSchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).optional(),
});

// ─── Create Subscription Plan ────────────────────────────────

export const createPlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(255),
  minSessions: z.number().int().min(1, 'At least 1 session required'),
  periodType: PeriodTypeEnum,
  periodDays: z.number().int().min(1).nullable().optional(),
  freezeSessions: z.number().int().min(0),
  freezeRetakeDays: z.number().int().min(0),
  amount: z.number().positive('Amount must be positive'),
  levels: z
    .array(planLevelSchema)
    .min(1, 'At least one level is required'),
}).superRefine((data, ctx) => {
  if (data.periodType === 'FROM_SUBSCRIPTION_DATE') {
    if (data.periodDays == null || data.periodDays < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'periodDays is required when periodType is FROM_SUBSCRIPTION_DATE',
        path: ['periodDays'],
      });
    }
  } else {
    // FROM_MONTH_START — periodDays must be null/absent
    if (data.periodDays != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'periodDays must be null when periodType is FROM_MONTH_START',
        path: ['periodDays'],
      });
    }
  }
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;

// ─── Update Subscription Plan ────────────────────────────────

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  minSessions: z.number().int().min(1).optional(),
  periodType: PeriodTypeEnum.optional(),
  periodDays: z.number().int().min(1).nullable().optional(),
  freezeSessions: z.number().int().min(0).optional(),
  freezeRetakeDays: z.number().int().min(0).optional(),
  amount: z.number().positive().optional(),
  levels: z.array(planLevelSchema).min(1).optional(),
}).superRefine((data, ctx) => {
  // Only cross-validate if both are being set
  if (data.periodType === 'FROM_SUBSCRIPTION_DATE' && data.periodDays != null && data.periodDays < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'periodDays must be a positive integer',
      path: ['periodDays'],
    });
  }
  if (data.periodType === 'FROM_MONTH_START' && data.periodDays != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'periodDays must be null when periodType is FROM_MONTH_START',
      path: ['periodDays'],
    });
  }
});

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

// ─── List Plans Query ─────────────────────────────────────────

export const listPlansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  search: z.string().min(1).max(100).optional(),
});

export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;

// ─── Enroll Trainee ───────────────────────────────────────────

export const enrollSchema = z.object({
  traineeId: z.string().uuid(),
  planId: z.string().uuid(),
  levelId: z.string().uuid(),
  groupId: z.string().uuid(),
  amountPaid: z.number().min(0).default(0),
  paymentStatus: PaymentStatusEnum.default('UNPAID'),
  // Required only when actual money changes hands (amountPaid > 0).
  paymentMethod: PaymentMethodEnum.optional(),
}).superRefine((data, ctx) => {
  if (data.amountPaid > 0 && !data.paymentMethod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'paymentMethod is required when a payment amount is provided',
      path: ['paymentMethod'],
    });
  }
});

export type EnrollInput = z.infer<typeof enrollSchema>;

// ─── Renew Subscription ───────────────────────────────────────

export const renewSchema = z.object({
  traineeId: z.string().uuid(),
  planId: z.string().uuid(),
  levelId: z.string().uuid(),
  groupId: z.string().uuid(),
  amountPaid: z.number().min(0).default(0),
  paymentStatus: PaymentStatusEnum.default('UNPAID'),
  // Required only when actual money changes hands (amountPaid > 0).
  paymentMethod: PaymentMethodEnum.optional(),
}).superRefine((data, ctx) => {
  if (data.amountPaid > 0 && !data.paymentMethod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'paymentMethod is required when a payment amount is provided',
      path: ['paymentMethod'],
    });
  }
});

export type RenewInput = z.infer<typeof renewSchema>;
