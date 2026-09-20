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
 * runs each job in sequence per tenant, isolating failures per tenant.
 *
 * ⚠️ OPT-IN. Jobs run only where `RUN_SCHEDULER === 'true'`. The `started` flag
 *    below is per-process, so on 2+ replicas every replica would otherwise run
 *    every job — duplicate expiry, duplicate archiving, duplicate session
 *    generation. Set RUN_SCHEDULER on ONE worker service (or use Railway Cron)
 *    and leave it unset on the web service. Unset means no jobs at all, which
 *    is the safe default: duplicated writes are worse than late ones.
 */

import cron from 'node-cron';
import { PrismaClient } from '@/generated/platform-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { runSubscriptionExpiryJob } from './subscription-expiry.job';
import { runArchiveJob } from './archive-records.job';
import { generateRollingSessionsForAllGroups } from '@/services/schedule.service';

let started = false;

// ─── Advisory locking ───────────────────────────────────────
// Second line of defence behind RUN_SCHEDULER, for the case where the worker
// service itself is scaled past one replica or a deploy briefly overlaps.
//
// pg_try_advisory_lock is SESSION-scoped, and `platformPrisma` runs on the
// POOLED DATABASE_URL — under PgBouncer transaction mode a "session" is a
// backend connection that returns to the pool between statements, so the lock
// and its unlock could land on different backends and leak the lock forever.
// We therefore take the lock on a dedicated client over the NON-POOLED
// DIRECT_DATABASE_URL, held open for exactly the duration of the job. If the
// process dies mid-job the connection drops and Postgres releases the lock for
// us — no stuck lease to clear by hand.

/** Arbitrary constant namespace, so ISSA's locks can't collide with anything else. */
const LOCK_NAMESPACE = 19730;

const LOCK_KEYS = {
  'subscription-expiry': 1,
  'archive-records': 2,
  'session-generation': 3,
} as const;

type JobName = keyof typeof LOCK_KEYS;

/**
 * Run `job` while holding the cluster-wide advisory lock for it, or skip if
 * another runner already holds it. Never throws — a failing job must not take
 * down the scheduler or the process.
 */
async function withJobLock(jobName: JobName, job: () => Promise<void>): Promise<void> {
  const directUrl = process.env.DIRECT_DATABASE_URL;

  if (!directUrl) {
    console.warn(
      `[scheduler] DIRECT_DATABASE_URL is not set — running ${jobName} WITHOUT an ` +
        'advisory lock. Safe only if exactly one process has RUN_SCHEDULER=true.'
    );
    try {
      await job();
    } catch (err) {
      console.error(`[scheduler] ${jobName} failed:`, err);
    }
    return;
  }

  const lockKey = LOCK_KEYS[jobName];
  const client = new PrismaClient({
    datasources: { db: { url: directUrl } },
    log: ['error'],
  });

  try {
    const [{ locked }] = await client.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_NAMESPACE}::int, ${lockKey}::int) AS locked
    `;

    if (!locked) {
      console.log(`[scheduler] ${jobName} is already running elsewhere — skipping`);
      return;
    }

    const startedAt = Date.now();
    try {
      await job();
      console.log(
        `[scheduler] ${jobName} finished in ${Math.round((Date.now() - startedAt) / 1000)}s`
      );
    } finally {
      await client.$queryRaw`
        SELECT pg_advisory_unlock(${LOCK_NAMESPACE}::int, ${lockKey}::int)
      `;
    }
  } catch (err) {
    console.error(`[scheduler] ${jobName} failed:`, err);
  } finally {
    // Also releases any advisory lock still held by this session.
    await client.$disconnect();
  }
}

// ─── Tenant iteration ───────────────────────────────────────

async function getActiveTenantIds(): Promise<string[]> {
  const tenants = await platformPrisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  return tenants.map((t) => t.id);
}

/**
 * Run `job` once per active tenant, sequentially.
 *
 * Each tenant is isolated in its own try/catch: one academy throwing must not
 * cost every academy after it in the list. (runSubscriptionExpiryJob and
 * runArchiveJob also swallow their own errors internally;
 * generateRollingSessionsForAllGroups does not, which is why this guard is
 * load-bearing rather than decorative.)
 */
async function runForAllTenants(
  jobName: string,
  job: (tenantId: string) => Promise<void>
) {
  const tenantIds = await getActiveTenantIds();
  console.log(`[scheduler] Running ${jobName} for ${tenantIds.length} tenant(s)`);

  let failed = 0;
  for (const tenantId of tenantIds) {
    try {
      await job(tenantId);
    } catch (err) {
      failed++;
      console.error(`[scheduler] ${jobName} failed for tenant=${tenantId}:`, err);
    }
  }

  if (failed > 0) {
    console.error(
      `[scheduler] ${jobName}: ${failed}/${tenantIds.length} tenant(s) failed`
    );
  }
}

// ─── Registration ───────────────────────────────────────────

export function startScheduler() {
  if (process.env.RUN_SCHEDULER !== 'true') {
    console.log(
      '[scheduler] RUN_SCHEDULER is not "true" — background jobs are disabled in ' +
        'this process. Set it on exactly one worker service.'
    );
    return;
  }

  if (started) return;
  started = true;

  // ── Daily at 00:05 UTC — Subscription Expiry ──────────────
  cron.schedule('5 0 * * *', () =>
    withJobLock('subscription-expiry', () =>
      runForAllTenants('subscription-expiry', runSubscriptionExpiryJob)
    )
  );

  // ── Weekly Sunday 01:00 UTC — Archive Old Records ─────────
  cron.schedule('0 1 * * 0', () =>
    withJobLock('archive-records', () =>
      runForAllTenants('archive-records', runArchiveJob)
    )
  );

  // ── Weekly Monday 02:00 UTC — Rolling Session Generation ──
  cron.schedule('0 2 * * 1', () =>
    withJobLock('session-generation', () =>
      runForAllTenants('session-generation', generateRollingSessionsForAllGroups)
    )
  );

  console.log('[scheduler] Background jobs registered (expiry, archive, session-generation)');
}
