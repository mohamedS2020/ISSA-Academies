/**
 * ISSA — Group Schemas
 *
 * Validates group creation and listing queries.
 * startTime is validated as HH:MM wall-clock string.
 */

import { z } from 'zod';

// ─── Day of Week ──────────────────────────────────────────────

export const DayOfWeekEnum = z.enum([
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
]);

// ─── Create Group ─────────────────────────────────────────────

export const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(255),
  captainId: z.string().uuid('Invalid captain ID'),
  planId: z.string().uuid('Invalid plan ID'),
  minTrainees: z.number().int().min(1),
  maxTrainees: z.number().int().min(1),
  scheduleDays: z
    .array(DayOfWeekEnum)
    .min(1, 'At least one schedule day is required'),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format'),
  sessionDuration: z.number().int().min(15, 'Minimum session is 15 minutes').max(480),
}).superRefine((data, ctx) => {
  if (data.maxTrainees < data.minTrainees) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'maxTrainees must be >= minTrainees',
      path: ['maxTrainees'],
    });
  }
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

// ─── Update Group ─────────────────────────────────────────────

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  captainId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
  minTrainees: z.number().int().min(1).optional(),
  maxTrainees: z.number().int().min(1).optional(),
  scheduleDays: z.array(DayOfWeekEnum).min(1).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sessionDuration: z.number().int().min(15).max(480).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

// ─── List Groups Query ────────────────────────────────────────

export const listGroupsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  planId: z.string().uuid().optional(),
  captainId: z.string().uuid().optional(),
  // Admin/Moderator group filters:
  day: DayOfWeekEnum.optional(),
  hour: z.coerce.number().int().min(0).max(23).optional(), // start-time hour
  ageMin: z.coerce.number().int().min(0).max(120).optional(), // trainee age (from DOB)
  ageMax: z.coerce.number().int().min(0).max(120).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
});

export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>;
