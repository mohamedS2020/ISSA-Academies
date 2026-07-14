/**
 * ISSA — Schedule Validation Schemas
 */

import { z } from 'zod';

// ─── Generate Sessions ───────────────────────────────────────

export const generateSessionsSchema = z.object({
  groupId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fromDate must be YYYY-MM-DD'),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'toDate must be YYYY-MM-DD'),
});

export type GenerateSessionsInput = z.infer<typeof generateSessionsSchema>;

// ─── Reschedule Session ──────────────────────────────────────
// Accepts branch-local wall-clock date + time; the route converts to UTC via
// the branch timezone (toUTC), matching how sessions are generated (FR-SC-07).
// The client stays timezone-free.

export const rescheduleSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:MM'),
});

export type RescheduleSessionInput = z.infer<typeof rescheduleSessionSchema>;

// ─── Cancel Session ──────────────────────────────────────────

export const cancelSessionSchema = z.object({
  reason: z.string().min(1).max(500),
});

export type CancelSessionInput = z.infer<typeof cancelSessionSchema>;
