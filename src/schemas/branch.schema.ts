import { z } from 'zod';
import { PayrollFrequency } from '@/types';

/**
 * Validate if a string is a valid IANA timezone name.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const createBranchSchema = z.object({
  name: z.string().min(1, 'Branch name is required').max(255),
  code: z
    .string()
    .min(2, 'Branch code must be at least 2 characters')
    .max(20)
    .toUpperCase()
    .regex(
      /^[A-Z0-9_]+$/,
      'Branch code must be uppercase letters, numbers, and underscores only'
    ),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  timezone: z.string().default('Africa/Cairo').refine(isValidTimezone, {
    message: 'Invalid IANA timezone string',
  }),
});

export const updateBranchSchema = z
  .object({
    name: z.string().min(1, 'Branch name is required').max(255).optional(),
    address: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    timezone: z
      .string()
      .refine(isValidTimezone, {
        message: 'Invalid IANA timezone string',
      })
      .optional(),
    isActive: z.boolean().optional(),
    payrollFrequency: z.nativeEnum(PayrollFrequency).optional(),
    payrollCustomDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // Only validate when payrollFrequency is explicitly being set to CUSTOM
    if (
      data.payrollFrequency === PayrollFrequency.CUSTOM &&
      (data.payrollCustomDays == null || data.payrollCustomDays < 1)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'payrollCustomDays is required when payrollFrequency is CUSTOM',
        path: ['payrollCustomDays'],
      });
    }
  });

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
