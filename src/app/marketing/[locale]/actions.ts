'use server';

/**
 * The landing page's demo form.
 *
 * Order matters: validate, rate-limit, SAVE, answer the visitor, and only then
 * (in `after`) send the notification email and the optional forward. A slow or
 * failing email can never cost a lead or keep the visitor waiting.
 */

import { after } from 'next/server';
import { headers } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import { createRateLimiter, getRateLimitKey } from '@/lib/auth/rate-limiter';
import { demoRequestSchema } from '@/schemas/lead.schema';
import { createLead } from '@/services/lead.service';
import { forwardLead, notifyNewLead } from '@/lib/marketing/lead-notification';
import {
  DEMO_REQUEST_FIELDS,
  type DemoRequestField,
  type DemoRequestState,
} from '@/lib/marketing/demo-request-state';

// Per visitor IP. In-memory, so per instance until the shared Redis store lands
// (hardening plan §6) — enough to stop casual form spam on a single instance.
const demoRequestLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxAttempts: 5 });

export async function submitDemoRequest(
  _previous: DemoRequestState,
  formData: FormData
): Promise<DemoRequestState> {
  const values = Object.fromEntries(
    DEMO_REQUEST_FIELDS.map((field) => [field, String(formData.get(field) ?? '')])
  ) as Record<DemoRequestField, string>;

  // Spam trap: people never see this field. Answer "success" so bots learn
  // nothing, and save nothing.
  if (String(formData.get('website') ?? '') !== '') {
    return { status: 'success', name: values.name.trim() };
  }

  const parsed = demoRequestSchema.safeParse({ ...values, locale: formData.get('locale') });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<DemoRequestField, true>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && (DEMO_REQUEST_FIELDS as readonly string[]).includes(field)) {
        fieldErrors[field as DemoRequestField] = true;
      }
    }
    // Only a tampered hidden field (the locale) fails without a visible field.
    const error = Object.keys(fieldErrors).length > 0 ? 'fields' : 'generic';
    return { status: 'error', error, fieldErrors, values };
  }

  // Counted only for well-formed requests, so fixing a typo never locks anyone out.
  const requestHeaders = await headers();
  const key = getRateLimitKey(new Request('http://localhost', { headers: requestHeaders }), 'demo-request');
  if (!demoRequestLimiter.check(key).allowed) {
    return { status: 'error', error: 'rateLimited', values };
  }

  let lead;
  try {
    lead = await createLead(parsed.data);
  } catch (error) {
    Sentry.captureException(error);
    return { status: 'error', error: 'generic', values };
  }

  after(async () => {
    await Promise.all([notifyNewLead(lead), forwardLead(lead)]);
  });

  return { status: 'success', name: parsed.data.name };
}
