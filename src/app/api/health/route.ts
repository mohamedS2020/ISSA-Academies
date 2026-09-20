/**
 * ISSA — Health Check
 *
 * GET /api/health
 *
 * Target for Railway's healthcheck and for external uptime monitoring.
 *
 * Deliberately:
 *   - **Unauthenticated** — a healthcheck that needs a token can't be used by the
 *     platform that decides whether to route traffic to this instance.
 *   - **Cheap enough** — `SELECT 1` on the platform connection, never touching a
 *     tenant schema. It does open a transaction, purely so `statement_timeout`
 *     can be set with `SET LOCAL` (see below); that costs BEGIN + SET + SELECT +
 *     COMMIT, measured at ~260ms against Neon versus ~70ms for a bare query.
 *     At healthcheck frequency that is a fair price for not leaking a connection
 *     on every probe during a stall.
 *   - **Quiet** — no version, build id, hostname, or error text in the body. This is
 *     a public endpoint; the only thing a caller learns is up or not up.
 *   - **Uncached** — see `dynamic`/`revalidate` below.
 *
 * 200 = the process is alive AND can reach the database.
 * 503 = alive but the database is unreachable, so Railway should not send traffic
 *       here and uptime monitoring should alert. Returning 200 while the database
 *       is down would make the check worthless.
 */

import { platformPrisma } from '@/lib/db/platform-client';

// A health check must run on every request. Without these, Next can evaluate the
// handler at build time and serve a cached 200 forever — the failure mode where
// the endpoint stays green while the database is down.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Server-side statement timeout. Fail fast: a healthcheck that hangs is as bad
 * as one that lies.
 *
 * This MUST be enforced by Postgres, not by racing a timer in Node. A
 * `Promise.race` against `setTimeout` only stops *us* waiting — the query stays
 * in flight holding a connection out of the pool. During a database stall every
 * probe would leak one, and because this shares `platformPrisma`'s pool with
 * login and tenant resolution, the healthcheck would help exhaust the pool it
 * exists to report on. `statement_timeout` makes Postgres abort the statement
 * and hand the connection back.
 *
 * Integer literal, not input — it is interpolated into SQL below because
 * `SET LOCAL` does not accept bind parameters.
 */
const DB_TIMEOUT_MS = 3000;

/**
 * How long to wait for a free connection before declaring the database
 * unhealthy. A probe that queues behind a saturated pool is itself consuming
 * the resource that is under stress, so it gives up quickly instead.
 */
const POOL_WAIT_MS = 1000;

export async function GET(): Promise<Response> {
  const startedAt = Date.now();

  try {
    // Deliberately uses the same pool the application uses. A healthcheck on a
    // private connection would report "ok" while the app's own pool was starved.
    await platformPrisma.$transaction(
      async (tx) => {
        // SET LOCAL is scoped to this transaction and resets on commit, so the
        // timeout cannot bleed onto whoever gets this pooled connection next —
        // the same reason withTenantContext pins search_path this way.
        await tx.$executeRawUnsafe(
          `SET LOCAL statement_timeout = ${DB_TIMEOUT_MS}`
        );
        await tx.$queryRaw`SELECT 1`;
      },
      {
        maxWait: POOL_WAIT_MS,
        // Backstop only, for the case where the server-side timeout is not
        // honoured at all (a pooler swallowing SET LOCAL, say). The margin is
        // deliberately generous so `statement_timeout` is what normally fires:
        // if Prisma's transaction timeout won the race it would issue a ROLLBACK
        // that Postgres cannot process until the running statement finishes —
        // re-creating the stuck-connection problem this code exists to avoid.
        // Measured: cancellation lands ~3.4s for a 3s timeout over a ~70ms link.
        timeout: DB_TIMEOUT_MS + 1500,
      }
    );

    return Response.json(
      { status: 'ok', db: 'up', latencyMs: Date.now() - startedAt },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    // Logged server-side only — the response body stays opaque.
    console.error('[health] database check failed:', err);

    return Response.json(
      { status: 'degraded', db: 'down' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
