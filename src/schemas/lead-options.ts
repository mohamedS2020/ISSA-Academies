/**
 * The demo form's fixed choices. Kept apart from lead.schema.ts so the landing
 * page's form can list them without bundling the validation library (Zod)
 * into the browser.
 */

/** Stored values for "Number of branches". The labels live in the message files. */
export const LEAD_BRANCHES = ['1', '2-5', '6+'] as const;

/** Stored values for "Main sport", in the order the form lists them. */
export const LEAD_SPORTS = [
  'football',
  'swimming',
  'tennis',
  'gymnastics',
  'karate',
  'basketball',
  'volleyball',
  'padel',
] as const;
