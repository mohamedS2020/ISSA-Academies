/**
 * ISSA — User Management Zod Schemas
 *
 * Used by both the API routes (server-side validation) and
 * the User Management page forms (client-side validation).
 */

import { z } from 'zod';
import { UserRole } from '@/types';
import { filterValidPrivileges, MODERATOR_PRIVILEGES } from '@/lib/auth/permissions';

// ─── Create User ─────────────────────────────────────────────

export const createUserSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(255),
    phoneNumber: z
      .string()
      .min(7, 'Phone number is required')
      .max(50)
      .regex(/^[+\d\s()-]+$/, 'Invalid phone number format'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100),
    role: z.enum([UserRole.ADMIN, UserRole.MODERATOR] as [string, ...string[]], {
      error: () => ({ message: 'Role must be ADMIN or MODERATOR' }),
    }),
    /** Privileges only apply when role = MODERATOR */
    privileges: z
      .array(z.enum(MODERATOR_PRIVILEGES))
      .default([]),
    language: z.enum(['en', 'ar']).default('en'),
  })
  .superRefine((data, ctx) => {
    if (data.role === UserRole.MODERATOR && data.privileges.length === 0) {
      // Allowed — moderator with no privileges is valid (empty access)
    }
    if (data.role === UserRole.ADMIN && data.privileges.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Admin role cannot have granular privileges — Admins have full access',
        path: ['privileges'],
      });
    }
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ─── Update User ─────────────────────────────────────────────

export const updateUserSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phoneNumber: z
    .string()
    .min(7)
    .max(50)
    .regex(/^[+\d\s()-]+$/, 'Invalid phone number format')
    .optional(),
  isActive: z.boolean().optional(),
  language: z.enum(['en', 'ar']).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ─── Set Moderator Privileges ────────────────────────────────

export const setPrivilegesSchema = z.object({
  privileges: z.array(z.enum(MODERATOR_PRIVILEGES)),
});

export type SetPrivilegesInput = z.infer<typeof setPrivilegesSchema>;

// ─── Admin-Initiated Password Reset ──────────────────────────

export const adminPasswordResetSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

export type AdminPasswordResetInput = z.infer<typeof adminPasswordResetSchema>;

// ─── List Users Query Params ─────────────────────────────────

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum([UserRole.ADMIN, UserRole.MODERATOR] as [string, ...string[]]).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  search: z.string().min(1).max(100).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
