/**
 * ISSA — Captain Registration & Management Zod Schemas
 *
 * Validates captain creation and updates including cross-field
 * validation for payroll type vs. rate fields.
 */

import { z } from 'zod';
import { PayrollType, DayOfWeek } from '@/types';

// ─── Days of Week Enum ────────────────────────────────────────

const dayOfWeekEnum = z.nativeEnum(DayOfWeek);

// ─── Create Captain ───────────────────────────────────────────

export const createCaptainSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(255),
    phoneNumber: z
      .string()
      .min(7, 'Phone number is required')
      .max(50)
      .regex(/^[+\d\s()-]+$/, 'Invalid phone number format'),
    specialization: z.string().max(255).optional().nullable(),
    attendingDays: z
      .array(dayOfWeekEnum)
      .min(1, 'At least one attending day is required'),
    payrollType: z.nativeEnum(PayrollType, {
      error: () => ({ message: 'Payroll type must be HOURS or SALARY_PERCENTAGE' }),
    }),
    /** Required when payrollType = HOURS */
    hourlyRate: z.coerce
      .number()
      .positive('Hourly rate must be positive')
      .max(99999.99)
      .optional()
      .nullable(),
    /** Required when payrollType = SALARY_PERCENTAGE */
    baseSalary: z.coerce
      .number()
      .positive('Base salary must be positive')
      .max(9999999.99)
      .optional()
      .nullable(),
    /** Required when payrollType = SALARY_PERCENTAGE (0–100) */
    percentage: z.coerce
      .number()
      .min(0, 'Percentage cannot be negative')
      .max(100, 'Percentage cannot exceed 100')
      .optional()
      .nullable(),
    language: z.enum(['en', 'ar']).default('en'),
  })
  .superRefine((data, ctx) => {
    if (data.payrollType === PayrollType.HOURS) {
      if (data.hourlyRate == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Hourly rate is required for Hours-based payroll',
          path: ['hourlyRate'],
        });
      }
    }

    if (data.payrollType === PayrollType.SALARY_PERCENTAGE) {
      if (data.baseSalary == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Base salary is required for Salary + Percentage payroll',
          path: ['baseSalary'],
        });
      }
      if (data.percentage == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Percentage is required for Salary + Percentage payroll',
          path: ['percentage'],
        });
      }
    }
  });

export type CreateCaptainInput = z.infer<typeof createCaptainSchema>;

// ─── Update Captain ───────────────────────────────────────────

export const updateCaptainSchema = z
  .object({
    name: z.string().min(2).max(255).optional(),
    phoneNumber: z
      .string()
      .min(7)
      .max(50)
      .regex(/^[+\d\s()-]+$/, 'Invalid phone number format')
      .optional(),
    specialization: z.string().max(255).optional().nullable(),
    attendingDays: z.array(dayOfWeekEnum).min(1).optional(),
    payrollType: z.nativeEnum(PayrollType).optional(),
    hourlyRate: z.coerce.number().positive().max(99999.99).optional().nullable(),
    baseSalary: z.coerce.number().positive().max(9999999.99).optional().nullable(),
    percentage: z.coerce.number().min(0).max(100).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // Only validate payroll cross-fields when payrollType is explicitly being set
    if (data.payrollType === PayrollType.HOURS && data.hourlyRate == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hourly rate is required when changing to Hours-based payroll',
        path: ['hourlyRate'],
      });
    }
    if (data.payrollType === PayrollType.SALARY_PERCENTAGE) {
      if (data.baseSalary == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Base salary is required when changing to Salary + Percentage payroll',
          path: ['baseSalary'],
        });
      }
      if (data.percentage == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Percentage is required when changing to Salary + Percentage payroll',
          path: ['percentage'],
        });
      }
    }
  });

export type UpdateCaptainInput = z.infer<typeof updateCaptainSchema>;

// ─── List Captains Query Params ───────────────────────────────

export const listCaptainsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().min(1).max(100).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
});

export type ListCaptainsQuery = z.infer<typeof listCaptainsQuerySchema>;
