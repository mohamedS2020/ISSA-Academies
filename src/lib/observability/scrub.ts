/**
 * ISSA — Sentry PII scrubbing
 *
 * Runs as `beforeSend` on every Sentry client (server, edge, browser). Nothing
 * reaches Sentry without passing through here.
 *
 * ⚠️ WHY THIS IS AGGRESSIVE
 *
 * This platform holds personal data about children: trainee names, dates of
 * birth, medical conditions, guardian phone numbers and parent ID card numbers.
 * Phone numbers are also the login identifier, so they appear in request bodies,
 * lookups and user records throughout. Leaking any of it to a third-party error
 * tracker would be a serious problem, and a legal one in most jurisdictions.
 *
 * The rule here is: losing a value that would have been useful in a stack trace
 * is always cheaper than leaking one. When in doubt, redact.
 *
 * Three layers, deliberately overlapping:
 *   1. Whole high-risk containers are dropped outright (cookies, auth headers,
 *      request bodies, query strings) — never filtered, removed.
 *   2. Values are redacted by KEY name, so a field is caught wherever it appears
 *      and whatever it contains.
 *   3. Remaining strings are pattern-scrubbed for phone numbers and JWTs, which
 *      catches values interpolated into messages where no key protects them.
 */

import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/**
 * Field names whose VALUE is always replaced, at any depth.
 * Matched case-insensitively, ignoring separators, so `phone_number`,
 * `phoneNumber` and `PhoneNumber` are all caught.
 */
const SENSITIVE_KEYS = new Set([
  // Credentials and tokens
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'jwtaccesssecret',
  'jwtrefreshsecret',
  'secret',
  'apikey',
  // Identifiers that are also credentials here
  'phonenumber',
  'phone',
  'whatsappnumber',
  'contactphone',
  'adminphone',
  // Personal data, much of it about minors
  'parentidcard',
  'medicalcondition',
  'dateofbirth',
  'dob',
  'email',
  'contactemail',
  'address',
  // Connection strings carry credentials
  'databaseurl',
  'directdatabaseurl',
]);

const REDACTED = '[redacted]';

/** 7+ digits with optional +, spaces, dashes, dots or parens between them. */
const PHONE_PATTERN = /\+?\d[\d\s().-]{5,}\d/g;

/** A JWT: three base64url segments separated by dots. */
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;

/** Guards against pathological or cyclic payloads. */
const MAX_DEPTH = 8;

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z]/g, '');
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normaliseKey(key));
}

/**
 * Pattern-scrub a free-text string.
 *
 * Deliberately blunt. A UUID survives (its groups contain letters), but a long
 * digit run does not — and that is the right trade: an over-redacted number in a
 * stack trace costs a little debugging context, while an under-redacted one is a
 * child's phone number sitting in a third-party system.
 */
export function scrubString(value: string): string {
  return value
    .replace(JWT_PATTERN, '[redacted-token]')
    .replace(PHONE_PATTERN, '[redacted-phone]');
}

/** Recursively redact by key name, then pattern-scrub whatever is left. */
function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[redacted-depth]';

  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : scrubValue(val, depth + 1);
  }
  return out;
}

/**
 * `beforeSend` hook. Returning null would drop the event entirely; we always
 * return a scrubbed event so errors are still visible, just without the data.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  // ── Layer 1: drop high-risk containers wholesale ──────────
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;

    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (isSensitiveKey(name)) delete event.request.headers[name];
      }
    }

    // A URL can carry identifiers in the path (/api/trainees/search?q=+2010...).
    if (event.request.url) {
      event.request.url = scrubString(event.request.url.split('?')[0]);
    }
  }

  // Never identify the human. `userId` as a tag is enough to correlate, and is
  // set explicitly in withAuth.
  delete event.user;

  // ── Layers 2 and 3 over everything that remains ───────────
  if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra;
  if (event.contexts) {
    event.contexts = scrubValue(event.contexts) as typeof event.contexts;
  }
  if (event.tags) event.tags = scrubValue(event.tags) as typeof event.tags;

  if (event.message) event.message = scrubString(event.message);

  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = scrubString(ex.value);
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      ...(crumb.message ? { message: scrubString(crumb.message) } : {}),
      ...(crumb.data ? { data: scrubValue(crumb.data) as typeof crumb.data } : {}),
    }));
  }

  return event;
}
