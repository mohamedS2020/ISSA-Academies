/**
 * ISSA — Job Scheduler
 *
 * Registers and starts all background jobs.
 * Uses node-cron for scheduling.
 *
 * Jobs registered here:
 *   - subscription-expiry    (daily 00:05 UTC)
 *   - archive-records        (weekly Sunday 01:00 UTC)
 *   - session-generation     (weekly Monday 02:00 UTC — extends rolling 4-week window)
 *
 * Tenant-aware: iterates all active tenants from the platform DB and
 * runs each job in sequence per tenant.
 *
 * ⚠️  Call startScheduler() once from the app bootstrap (e.g., instrumentation.ts).
 *     Multiple calls will register duplicate cron jobs.
 */

import cron from 'node-cron';
import { platformPrisma } from '@/lib/db/platform-client';
import { runSubscriptionExpiryJob } from './subscription-expiry.job';
import { runArchiveJob } from './archive-records.job';
import { generateRollingSessionsForAllGroups } from '@/services/schedule.service';

let started = false;

async function getActiveTenantIds(): Promise<string[]> {
  const tenants = await platformPrisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  return tenants.map((t) => t.id);
}

async function runForAllTenants(
  jobName: string,
  job: (tenantId: string) => Promise<void>
) {
  const tenantIds = await getActiveTenantIds();
  console.log(`[scheduler] Running ${jobName} for ${tenantIds.length} tenant(s)`);
  for (const tenantId of tenantIds) {
    await job(tenantId);
  }
}

export function startScheduler() {
  if (started) return;
  started = true;

  // ── Daily at 00:05 UTC — Subscription Expiry ──────────────
  cron.schedule('5 0 * * *', async () => {
    await runForAllTenants('subscription-expiry', runSubscriptionExpiryJob);
  });

  // ── Weekly Sunday 01:00 UTC — Archive Old Records ─────────
  cron.schedule('0 1 * * 0', async () => {
    await runForAllTenants('archive-records', runArchiveJob);
  });

  // ── Weekly Monday 02:00 UTC — Rolling Session Generation ──
  cron.schedule('0 2 * * 1', async () => {
    await runForAllTenants('session-generation', generateRollingSessionsForAllGroups);
  });

  console.log('[scheduler] Background jobs registered (expiry, archive, session-generation)');
}
