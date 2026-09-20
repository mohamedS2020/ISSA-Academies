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
 *
 * ⚠️ Where RUN_SCHEDULER is "true", DIRECT_DATABASE_URL (the non-pooled endpoint)
 *    is REQUIRED. startScheduler() throws and registers nothing without it,
 *    rather than running jobs unprotected by the advisory lock.
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
// pg_try_advisory_lock is SESSION-scoped, so the lock and its unlock must run
// on the same PostgreSQL session. Two things are needed for that, and BOTH
// matter:
//
//   1. A non-pooled endpoint (DIRECT_DATABASE_URL). `platformPrisma` runs on the
//      pooled DATABASE_URL, where under transaction-mode PgBouncer a "session"
//      is a backend connection that returns to the pool between statements.
//
//   2. `connection_limit=1` on the lock client. A direct URL alone is NOT
//      enough — PrismaClient keeps its own pool regardless, and nothing
//      guarantees two sequential queries use the same connection. Pinning the
//      pool to one connection is what actually makes the session single.
//
// Both are enforced at startup (assertLockingAvailable) and the client is built
// by buildLockUrl. If the process dies mid-job the connection drops and Postgres
// releases the lock for us — no stuck lease to clear by hand.

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
/**
 * Validate that jobs can actually be run safely, or throw.
 *
 * Called once from startScheduler() BEFORE any cron job is registered, so a
 * misconfigured worker registers nothing at all.
 *
 * This fails closed on purpose. Running the jobs without the advisory lock is
 * precisely the multi-replica duplication this module exists to prevent, and a
 * warning in the logs is far too easy to miss on a service that otherwise looks
 * healthy. Throwing during instrumentation makes the misconfiguration loud.
 */
function assertLockingAvailable(): string {
  const directUrl = process.env.DIRECT_DATABASE_URL;

  if (!directUrl) {
    throw new Error(
      '[scheduler] RUN_SCHEDULER is "true" but DIRECT_DATABASE_URL is not set. ' +
        'Background jobs need it for the advisory lock that stops two runners ' +
        'executing the same job; without it a scaled worker would duplicate ' +
        'subscription expiry, archiving and session generation. Set ' +
        'DIRECT_DATABASE_URL (the non-pooled endpoint) or unset RUN_SCHEDULER.'
    );
  }

  // A transaction-mode pooler hands out a different backend connection per
  // statement, which breaks session-scoped advisory locks no matter what the
  // client pool does. `pgbouncer=true` is an explicit declaration that the URL
  // is pooled, so treat it as a hard misconfiguration rather than guessing.
  if (/[?&]pgbouncer=true\b/i.test(directUrl)) {
    throw new Error(
      '[scheduler] DIRECT_DATABASE_URL carries pgbouncer=true, so it is a pooled ' +
        'endpoint. Advisory locks are session-scoped and cannot be held across a ' +
        'transaction-mode pooler. Point DIRECT_DATABASE_URL at the direct ' +
        '(non-pooled) endpoint.'
    );
  }

  return directUrl;
}

/**
 * Build the lock connection URL.
 *
 * `connection_limit=1` is load-bearing, not a tuning knob. A PrismaClient keeps
 * a pool even against a direct URL, and nothing guarantees two sequential
 * queries land on the same connection — so the `pg_advisory_unlock` after the
 * job could run on a different backend than the `pg_try_advisory_lock` that
 * took it, returning false and leaving the lock held until the client
 * disconnects. Pinning the pool to a single connection makes acquire, hold and
 * release provably the same PostgreSQL session.
 */
function buildLockUrl(directUrl: string): string {
  const url = new URL(directUrl);
  url.searchParams.set('connection_limit', '1');
  return url.toString();
}

async function withJobLock(jobName: JobName, job: () => Promise<void>): Promise<void> {
  // startScheduler() has already validated this; re-read rather than close over
  // it so a job never runs against stale configuration.
  const directUrl = assertLockingAvailable();

  const lockKey = LOCK_KEYS[jobName];
  const client = new PrismaClient({
    datasources: { db: { url: buildLockUrl(directUrl) } },
    log: ['error'],
  });

  try {
    const rows = await client.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_NAMESPACE}::int, ${lockKey}::int) AS locked
    `;

    if (rows[0]?.locked !== true) {
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
      // pg_advisory_unlock returns false if this session does not hold the lock,
      // which would mean the single-connection guarantee above has been broken.
      // Surface that rather than letting $disconnect() quietly paper over it.
      const released = await client.$queryRaw<{ released: boolean }[]>`
        SELECT pg_advisory_unlock(${LOCK_NAMESPACE}::int, ${lockKey}::int) AS released
      `;
      if (released[0]?.released !== true) {
        console.error(
          `[scheduler] ${jobName}: advisory unlock reported false — the lock was ` +
            'taken on a different connection than the unlock. Falling back to ' +
            'releasing it by closing the session.'
        );
      }
    }
  } catch (err) {
    console.error(`[scheduler] ${jobName} failed:`, err);
  } finally {
    // Final safety net: ending the session releases any advisory lock it still
    // holds, so a failure above cannot wedge the job permanently.
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

  // Fail closed before registering anything: a worker that cannot lock must not
  // run jobs at all, rather than run them unprotected. Throws with an
  // actionable message.
  assertLockingAvailable();

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
