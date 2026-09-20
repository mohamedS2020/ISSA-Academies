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
 *   - **Cheap** — one `SELECT 1` on the platform connection. Railway polls this
 *     frequently, so it must not touch tenant schemas or open a transaction.
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

/** Fail fast: a healthcheck that hangs is as bad as one that lies. */
const DB_TIMEOUT_MS = 3000;

export async function GET(): Promise<Response> {
  const startedAt = Date.now();

  try {
    await Promise.race([
      platformPrisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('db timeout')), DB_TIMEOUT_MS)
      ),
    ]);

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
