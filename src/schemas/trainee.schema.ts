/**
 * ISSA — Trainee Registration & Management Zod Schemas
 *
 * Covers the 4-step registration form and edit/search operations.
 * Shared between the API routes (server-side) and the multi-step form (client-side).
 *
 * Step 1 — Required personal info
 * Step 2 — Skills & subscription level
 * Step 3 — Optional family info
 * Step 4 — Optional physical & psychological
 */

import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────

/** How the trainee came to the academy — captured at registration. */
export const ReferralTypeEnum = z.enum(['NEW', 'NETWORK', 'OLD', 'CONTINUOUS']);

// ─── Step 1 — Required Personal Information ──────────────────

export const traineeStep1Schema = z.object({
  name: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(255),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .refine((d) => {
      const date = new Date(d);
      return !isNaN(date.getTime()) && date < new Date();
    }, 'Date of birth must be a valid past date'),
  phoneNumber: z
    .string()
    .min(7, 'Phone number is required')
    .max(50)
    .regex(/^[+\d\s()-]+$/, 'Invalid phone number format'),
  whatsappNumber: z
    .string()
    .min(7, 'WhatsApp number is required')
    .max(50)
    .regex(/^[+\d\s()-]+$/, 'Invalid WhatsApp number format'),
  parentIdCard: z
    .string()
    .min(5, 'Parent ID card number is required')
    .max(50),
  medicalCondition: z
    .string()
    .min(1, 'Medical condition is required (write "None" if not applicable)')
    .max(2000),
  referralType: ReferralTypeEnum,
  // Account holder identity. For a child this is the parent/guardian name.
  // For an adult registering themselves, set isSelfAccount=true and the
  // trainee's own name (`name`) is used as the account name.
  guardianName: z.string().max(255).optional().nullable(),
  isSelfAccount: z.boolean().optional(),
});

export type TraineeStep1Input = z.infer<typeof traineeStep1Schema>;

// ─── Step 2 — Skills & Subscription ─────────────────────────

export const traineeStep2Schema = z.object({
  pastExperience: z.string().max(2000).optional().nullable(),
  otherAcademies: z.string().max(1000).optional().nullable(),
  /** Level from the chosen subscription plan — required before enrollment */
  levelId: z.string().uuid('Invalid level ID').optional().nullable(),
});

export type TraineeStep2Input = z.infer<typeof traineeStep2Schema>;

// ─── Step 3 — Optional Family Information ────────────────────

export const traineeStep3Schema = z.object({
  maritalStatus: z.string().max(50).optional().nullable(),
  fatherJob: z.string().max(255).optional().nullable(),
  fatherQualifications: z.string().max(255).optional().nullable(),
  motherJob: z.string().max(255).optional().nullable(),
  motherQualifications: z.string().max(255).optional().nullable(),
  birthOrder: z.coerce.number().int().min(1).max(20).optional().nullable(),
});

export type TraineeStep3Input = z.infer<typeof traineeStep3Schema>;

// ─── Step 4 — Optional Physical & Psychological ───────────────

const positiveDecimal = z.coerce
  .number()
  .positive('Must be a positive number')
  .max(999.99)
  .optional()
  .nullable();

export const traineeStep4Schema = z.object({
  personalityTraits: z.string().max(2000).optional().nullable(),
  height: positiveDecimal,
  weight: positiveDecimal,
  armLength: positiveDecimal,
  footLength: positiveDecimal,
  chestCircumference: positiveDecimal,
  waistCircumference: positiveDecimal,
});

export type TraineeStep4Input = z.infer<typeof traineeStep4Schema>;

// ─── Full Create Trainee (all 4 steps merged) ────────────────

export const createTraineeSchema = traineeStep1Schema
  .merge(traineeStep2Schema)
  .merge(traineeStep3Schema)
  .merge(traineeStep4Schema);

export type CreateTraineeInput = z.infer<typeof createTraineeSchema>;

// ─── Update Trainee (all fields optional) ────────────────────

export const updateTraineeSchema = createTraineeSchema.partial();

export type UpdateTraineeInput = z.infer<typeof updateTraineeSchema>;

// ─── Change Level / Group (within the current subscription plan) ─────
// Admin/Moderator may move an enrolled trainee to a different level and/or
// group, but only ones belonging to their active subscription's plan.
export const updateAssignmentSchema = z
  .object({
    levelId: z.string().uuid('Invalid level ID').optional(),
    groupId: z.string().uuid('Invalid group ID').optional(),
  })
  .refine((d) => d.levelId != null || d.groupId != null, {
    message: 'Provide a level and/or group to change',
  });

export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

// ─── Search Trainees ─────────────────────────────────────────

export const searchTraineeSchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters').max(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SearchTraineeQuery = z.infer<typeof searchTraineeSchema>;

// ─── List Trainees Query Params ───────────────────────────────

export const listTraineesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().min(1).max(100).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
});

export type ListTraineesQuery = z.infer<typeof listTraineesQuerySchema>;
