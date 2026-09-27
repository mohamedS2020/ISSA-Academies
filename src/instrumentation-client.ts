/**
 * ISSA — Sentry (browser)
 *
 * Next.js loads this automatically on the client. Catches crashes in the
 * dashboard and the parent portal — the failures a user sees but never reports.
 *
 * ⚠️ The DSN here ships inside the client bundle, so it must be the PUBLIC
 * variable. That is by design: a Sentry DSN is a write-only ingestion key, not a
 * secret. `SENTRY_AUTH_TOKEN` is the real secret and must never appear in
 * anything prefixed NEXT_PUBLIC_.
 */

import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/observability/scrub';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,

  // Same rule as the server: nothing personal leaves the browser either. Browser
  // events are if anything riskier — breadcrumbs capture form input, clicked
  // element text and navigation URLs, all of which carry trainee names and
  // phone numbers in this app.
  sendDefaultPii: false,
  beforeSend: scrubEvent,

  // Session replay is deliberately NOT enabled. It records the DOM, which here
  // means trainee names, dates of birth and medical conditions. Do not turn it
  // on without a serious look at what it would capture.
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
});

// Required by Next.js so Sentry can report client-side navigation errors.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
