/**
 * ISSA — App Instrumentation
 *
 * Next.js calls `register()` once when a new server instance starts, before
 * it accepts requests. This is the only correct place to bootstrap
 * long-lived background processes like cron jobs.
 *
 * ⚠️ Without this file, src/jobs/scheduler.ts::startScheduler() is never
 *    called by anything — the subscription-expiry, archive-records, and
 *    session-generation cron jobs silently never run. This was a real gap:
 *    found during a production-readiness review, confirmed by grepping the
 *    codebase for any caller of startScheduler() and finding none.
 *
 * ⚠️ register() runs in EVERY replica, so startScheduler() is itself gated on
 *    RUN_SCHEDULER === 'true' and returns immediately without it. Calling it
 *    unconditionally here is intentional — the gate belongs with the jobs, not
 *    with the bootstrap. Set RUN_SCHEDULER on one worker service only.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Sentry first, so a failure in anything below is itself reported. Each
  // runtime needs its own init — the edge runtime cannot load the Node SDK.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }

  // Only run in the Node.js runtime — this code uses Prisma and node-cron,
  // neither of which work in the Edge runtime. instrumentation.ts runs in
  // both by default, so this guard is required.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('@/jobs/scheduler');
    try {
      startScheduler();
    } catch (err) {
      // startScheduler throws when RUN_SCHEDULER is set but the worker cannot
      // take the advisory lock. Report it, then rethrow so the service still
      // fails closed — a worker that cannot lock must not run jobs. This is
      // exactly the class of misconfiguration that otherwise stays invisible
      // until duplicated writes show up days later.
      Sentry.captureException(err);
      throw err;
    }
  }
}

/**
 * Next.js calls this for errors thrown in server components, route handlers and
 * data fetching that never reach our own `withErrorHandler` — the ones that
 * would otherwise vanish into the platform logs.
 */
export const onRequestError = Sentry.captureRequestError;
