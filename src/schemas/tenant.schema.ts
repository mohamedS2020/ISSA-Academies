/**
 * ISSA — Tenant Validation Schemas
 *
 * Shared Zod schemas for Super Admin tenant management.
 * Used by API routes (server-side) and the Create Tenant wizard (client-side).
 */

import { z } from 'zod';

// ─── Create Tenant ──────────────────────────────────────────

export const createTenantSchema = z.object({
  // Academy info
  name: z
    .string()
    .min(2, 'Academy name must be at least 2 characters')
    .max(255, 'Academy name must be at most 255 characters'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100, 'Slug must be at most 100 characters')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase letters, numbers, and hyphens only'
    ),
  contactName: z.string().max(255).optional(),
  contactPhone: z
    .string()
    .regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number format')
    .optional(),
  contactEmail: z.string().email('Invalid email address').optional(),

  // Default admin account
  adminName: z
    .string()
    .min(2, 'Admin name must be at least 2 characters')
    .max(255),
  adminPhone: z
    .string()
    .min(1, 'Admin phone number is required')
    .regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number format'),

  // Default branch
  branchName: z
    .string()
    .min(2, 'Branch name must be at least 2 characters')
    .max(255),
  branchCode: z
    .string()
    .min(2, 'Branch code must be at least 2 characters')
    .max(20, 'Branch code must be at most 20 characters')
    .regex(
      /^[A-Z0-9_]+$/,
      'Branch code must be uppercase letters, numbers, and underscores only'
    ),
  branchTimezone: z
    .string()
    .min(1, 'Timezone is required')
    .default('Africa/Cairo'),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

// ─── Update Tenant ──────────────────────────────────────────

export const updateTenantSchema = z.object({
  name: z
    .string()
    .min(2, 'Academy name must be at least 2 characters')
    .max(255)
    .optional(),
  contactName: z.string().max(255).optional(),
  contactPhone: z
    .string()
    .regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number format')
    .optional(),
  contactEmail: z.string().email('Invalid email address').optional(),
  maxBranches: z.number().int().min(1).max(100).optional(),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// ─── Tenant Status Change ───────────────────────────────────

const VALID_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;

export const tenantStatusSchema = z.object({
  status: z.enum(VALID_STATUSES, {
    message: 'Status must be one of: ACTIVE, SUSPENDED, DELETED',
  }),
});

export type TenantStatusInput = z.infer<typeof tenantStatusSchema>;

/**
 * Validate that a status transition is allowed.
 *
 * Rules:
 *   ACTIVE     → SUSPENDED ✓
 *   SUSPENDED  → ACTIVE    ✓
 *   ACTIVE     → DELETED   ✓
 *   SUSPENDED  → DELETED   ✓
 *   DELETED    → *         ✗ (cannot un-delete)
 */
export function isValidStatusTransition(
  currentStatus: string,
  newStatus: string
): boolean {
  if (currentStatus === newStatus) return false;

  // Cannot transition FROM deleted
  if (currentStatus === 'DELETED') return false;

  // Can always transition TO deleted
  if (newStatus === 'DELETED') return true;

  // ACTIVE ↔ SUSPENDED
  if (currentStatus === 'ACTIVE' && newStatus === 'SUSPENDED') return true;
  if (currentStatus === 'SUSPENDED' && newStatus === 'ACTIVE') return true;

  return false;
}

// ─── Slug Generation ────────────────────────────────────────

/**
 * Generate a URL-safe slug from an academy name.
 *
 * @example generateSlug('Aqua Stars Academy') → 'aqua-stars-academy'
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/[\s_]+/g, '-') // Replace spaces/underscores with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens
}
