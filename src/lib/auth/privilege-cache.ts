/**
 * Moderator privilege cache
 *
 * `withAuth` loads a MODERATOR's privileges from the tenant database on every
 * request, and `loadModeratorPrivileges` opens its own `withTenantContext`
 * transaction to do it. That doubles the per-request database cost for
 * moderators — roughly 8 round trips instead of 4 — before the handler has done
 * any work of its own.
 *
 * This caches the result per user for a short window.
 *
 * ── Why not put privileges in the JWT ──────────────────────
 *
 * That was the other option in the hardening plan, and it is faster still: zero
 * round trips. It was rejected because access tokens live 15 minutes, so
 * revoking a moderator's privilege would take up to 15 minutes to take effect,
 * with no way to force it sooner. A 30-second cache keeps almost all of the
 * saving while keeping revocation effectively immediate — and `invalidate()`
 * below makes it actually immediate on the instance that performed the change.
 *
 * ── Why not Redis ──────────────────────────────────────────
 *
 * §6 moves the rate limiter to Redis because its counters must be shared across
 * replicas to mean anything. This is the opposite case: the whole point is to
 * avoid a network round trip, and swapping a Postgres call for a Redis call
 * would give most of the latency back. In-process is the right choice here.
 *
 * ⚠️ Per-process, so on N replicas an explicit invalidation only clears the
 * instance that handled the update. Other instances keep serving the old
 * privileges until the TTL expires — a bounded staleness of TTL_MS, not
 * indefinite. Keep the TTL short for that reason.
 */

import type { ModeratorPrivilege } from '@/types';

/** Short by design — this is the worst-case delay on privilege revocation. */
const TTL_MS = Math.max(
  1000,
  parseInt(process.env.PRIVILEGE_CACHE_TTL_MS ?? '30000', 10) || 30000
);

/** Sweep expired entries once the map grows past this, so it cannot leak. */
const SWEEP_THRESHOLD = 5000;

interface Entry {
  privileges: ModeratorPrivilege[];
  expiresAt: number;
}

const cache = new Map<string, Entry>();

/**
 * Key on tenant AND user. User ids are per-tenant UUIDs so a collision is
 * vanishingly unlikely, but a cache that can return one academy's privileges
 * for another academy's user is not a risk worth leaving to probability.
 */
function key(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

function sweep(now: number): void {
  for (const [k, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(k);
  }
}

/** Cached privileges, or null on a miss or expiry. */
export function getCachedPrivileges(
  tenantId: string,
  userId: string
): ModeratorPrivilege[] | null {
  const entry = cache.get(key(tenantId, userId));
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key(tenantId, userId));
    return null;
  }

  return entry.privileges;
}

export function setCachedPrivileges(
  tenantId: string,
  userId: string,
  privileges: ModeratorPrivilege[]
): void {
  const now = Date.now();
  if (cache.size >= SWEEP_THRESHOLD) sweep(now);

  cache.set(key(tenantId, userId), {
    privileges,
    expiresAt: now + TTL_MS,
  });
}

/**
 * Drop a user's cached privileges immediately.
 *
 * Call this from every path that changes what a moderator is allowed to do, so
 * a revocation takes effect at once rather than waiting out the TTL. Cheap and
 * safe to call when nothing is cached.
 */
export function invalidatePrivileges(tenantId: string, userId: string): void {
  cache.delete(key(tenantId, userId));
}

/** Test helper — drops everything. */
export function clearPrivilegeCache(): void {
  cache.clear();
}
