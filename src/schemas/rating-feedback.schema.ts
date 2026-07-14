/**
 * ISSA — Captain Rating & Feedback Zod Schemas
 */

import { z } from 'zod';

// Trainee rates their captain: a whole number of stars, 1..5.
export const rateCaptainSchema = z.object({
  stars: z.number().int().min(1).max(5),
});
export type RateCaptainInput = z.infer<typeof rateCaptainSchema>;

// Captain writes a feedback entry on a trainee.
export const createFeedbackSchema = z.object({
  message: z.string().trim().min(1, 'Feedback cannot be empty').max(2000),
});
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
