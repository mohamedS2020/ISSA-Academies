/**
 * ISSA — Attendance Validation Schemas
 */

import { z } from 'zod';

// ─── Submit Attendance ───────────────────────────────────────

const attendanceStatusEnum = z.enum(['PRESENT', 'ABSENT', 'EXCUSED']);

export const attendanceRecordSchema = z.object({
  traineeId: z.string().uuid(),
  status: attendanceStatusEnum,
  notes: z.string().max(1000).optional(),
});

export const submitAttendanceSchema = z.object({
  sessionId: z.string().uuid(),
  records: z.array(attendanceRecordSchema).min(1, 'At least one attendance record is required'),
});

export type SubmitAttendanceInput = z.infer<typeof submitAttendanceSchema>;

// ─── Schedule Retake ─────────────────────────────────────────

export const scheduleRetakeSchema = z.object({
  traineeId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  retakeSessionId: z.string().uuid(),
});

export type ScheduleRetakeInput = z.infer<typeof scheduleRetakeSchema>;

// ─── Captain Evaluation ──────────────────────────────────────

export const createEvaluationSchema = z.object({
  sessionId: z.string().uuid(),
  traineeId: z.string().uuid(),
  notes: z.string().min(1).max(2000),
});

export const updateEvaluationSchema = z.object({
  notes: z.string().min(1).max(2000),
});

export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;
export type UpdateEvaluationInput = z.infer<typeof updateEvaluationSchema>;
