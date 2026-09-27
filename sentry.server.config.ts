/**
 * ISSA — Sentry (Node.js server runtime)
 *
 * Loaded by src/instrumentation.ts when NEXT_RUNTIME === 'nodejs'.
 * Covers API route handlers, server components and background jobs.
 *
 * Inert without SENTRY_DSN, so local development and any environment that has
 * not been given a DSN simply reports nothing rather than failing.
 */

import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/observability/scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.NODE_ENV,

  // ⚠️ Never send PII automatically. This platform holds data about children;
  // everything that reaches Sentry goes through scrubEvent first.
  sendDefaultPii: false,
  beforeSend: scrubEvent,

  // Performance tracing is OFF by default. It is genuinely useful for the
  // latency work in the hardening plan, but a trace is billed like an event and
  // the free tier is 5k/month — a busy day would exhaust it and start dropping
  // the ERRORS, which is the thing we actually cannot lose. Turn it on
  // deliberately with a small sample (0.05) once the quota can take it.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
});
