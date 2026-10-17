/**
 * The one phone-number field rule, shared by every schema that takes a phone.
 *
 * Validation used to be copied per form, with three different regexes: staff
 * forms accepted brackets and any length, the login form rejected brackets, and
 * none of them normalized. A number could be saved in a form that could never
 * be typed back at login. Now every schema normalizes first (src/lib/phone.ts)
 * and validates the result, so what is stored is exactly what login compares.
 */

import { z } from 'zod';
import { normalizePhone, PHONE_PATTERN } from '@/lib/phone';

export interface PhoneMessages {
  required?: string;
  invalid?: string;
}

/** A required phone number, normalized to its stored form. */
export function phoneNumberField(messages: PhoneMessages = {}) {
  return z
    .string()
    .min(1, messages.required ?? 'Phone number is required')
    .transform(normalizePhone)
    .pipe(z.string().regex(PHONE_PATTERN, messages.invalid ?? 'Invalid phone number format'));
}
