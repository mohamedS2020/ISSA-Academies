/**
 * ISSA — Authentication Validation Schemas
 *
 * Shared Zod schemas used by both API routes (server-side validation)
 * and forms (client-side validation). This establishes the validation
 * pattern for all other modules.
 */

import { z } from 'zod';

// ─── Login ──────────────────────────────────────────────────

export const loginSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number format'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Change Password ────────────────────────────────────────

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
    confirmPassword: z
      .string()
      .min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ─── Password Reset (Admin-initiated) ───────────────────────

export const passwordResetSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

// ─── Refresh Token ──────────────────────────────────────────

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

// ─── Switch Branch (Admin) ──────────────────────────────────

export const switchBranchSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  // Preserve the session's remember-me so re-issued tokens keep the right expiry.
  rememberMe: z.boolean().optional().default(false),
});

export type SwitchBranchInput = z.infer<typeof switchBranchSchema>;
