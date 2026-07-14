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
 */

export async function register() {
  // Only run in the Node.js runtime — this code uses Prisma and node-cron,
  // neither of which work in the Edge runtime. instrumentation.ts runs in
  // both by default, so this guard is required.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('@/jobs/scheduler');
    startScheduler();
  }
}
