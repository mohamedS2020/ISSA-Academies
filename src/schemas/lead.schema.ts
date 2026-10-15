/**
 * Marketing leads: the landing page's demo requests, managed in Super Admin.
 */

import { z } from 'zod';
import { LEAD_BRANCHES, LEAD_SPORTS } from './lead-options';

export { LEAD_BRANCHES, LEAD_SPORTS };

/** The sales pipeline, in order. Mirrors the LeadStatus enum in the platform schema. */
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'DEMO_BOOKED', 'WON', 'LOST'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Bring a phone number to one plain form before validating or storing it:
 * Arabic-Indic digits become ASCII, and the invisible direction marks and
 * zero-width characters that copy-paste (WhatsApp, contacts) brings along are
 * removed, as are spaces, dashes, dots and brackets. "+٢٠ ١٠٠ ١٢٣ ٤٥٦٧" and
 * "+20 100-123-4567" both become "+201001234567".
 */
export function normalizePhone(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[\s\-().]/g, '');
}

/** The public demo form. */
export const demoRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  academy: z.string().trim().min(2).max(160),
  // E.164 allows at most 15 digits; 7 is the shortest plausible local number.
  phone: z.string().transform(normalizePhone).pipe(z.string().regex(/^\+?[0-9]{7,15}$/)),
  branches: z.enum(LEAD_BRANCHES),
  sport: z.enum(LEAD_SPORTS),
  locale: z.enum(['en', 'ar']),
});

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;

/** Super Admin: list filters. */
export const listLeadsQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Super Admin: change a lead's status and/or notes. */
export const updateLeadSchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine((value) => value.status !== undefined || value.notes !== undefined, {
    message: 'Nothing to update',
  });

/** Super Admin: platform settings. An empty email turns notifications off. */
export const platformSettingsSchema = z.object({
  leadNotificationEmail: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.union([z.literal(''), z.email().max(254)])
  ),
});
