/**
 * ISSA — Sentry (Edge runtime)
 *
 * Loaded by src/instrumentation.ts when NEXT_RUNTIME === 'edge'. The only edge
 * code here is src/proxy.ts (subdomain resolution + locale routing), but that
 * runs on EVERY request, so a failure there takes the whole site down — worth
 * reporting even though the surface is small.
 */

import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/observability/scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.NODE_ENV,

  sendDefaultPii: false,
  beforeSend: scrubEvent,

  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
});
