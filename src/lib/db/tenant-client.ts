/**
 * ISSA — Tenant-Aware Prisma Client
 *
 * Provides tenant isolation via PostgreSQL schema-level `SET LOCAL search_path`.
 *
 * CRITICAL SECURITY NOTES:
 *   1. Uses `SET LOCAL` (not `SET`) — scoped to the transaction, resets on
 *      commit/rollback. This prevents search_path from bleeding across
 *      requests sharing the same pooled connection.
 *   2. PgBouncer MUST be in `transaction` mode (not `session`) for this to work.
 *   3. `sanitizeSchemaName()` prevents SQL injection in tenant IDs.
 *
 * Usage:
 *   const result = await withTenantContext(tenantId, async (tx) => {
 *     return tx.user.findMany({ where: { branchId } });
 *   });
 */

import { PrismaClient, Prisma } from '@/generated/tenant-client';
import { sanitizeSchemaName } from './migration-runner';
import { platformPrisma } from './platform-client';

// Re-export Prisma namespace for consumers that need types
export { Prisma };
export type TransactionClient = Prisma.TransactionClient;

/**
 * Execute a callback within a tenant's schema context.
 *
 * This wraps the callback in a Prisma interactive transaction that:
 *   1. Sets `search_path` to the tenant's schema using `SET LOCAL`
 *   2. Executes the callback
 *   3. Automatically resets search_path on commit/rollback
 *
 * @param tenantId - The raw tenant identifier (will be sanitized)
 * @param callback - Function receiving the transaction client
 * @param options  - Optional Prisma transaction options (timeout, isolation level)
 * @returns The return value of the callback
 *
 * @example
 * const trainees = await withTenantContext('acme-123', async (tx) => {
 *   return tx.traineeProfile.findMany({
 *     where: { branchId: ctx.branchId },
 *   });
 * });
 */
const tenantSchemaCache = new Map<string, string>();

/**
 * Resolves a tenant identifier (UUID, slug, or schema name) to the actual database schema name.
 * Uses an in-memory cache to avoid duplicate platform database queries.
 */
export async function resolveTenantSchema(tenantId: string): Promise<string> {
  if (!tenantId) {
    throw new Error('Tenant ID cannot be empty');
  }

  // 1. Check if it's already a full schema name (starts with tenant_)
  if (tenantId.startsWith('tenant_')) {
    return tenantId;
  }

  // 2. Check if it's a UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
  if (isUuid) {
    const cached = tenantSchemaCache.get(tenantId);
    if (cached) return cached;

    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { schemaName: true },
    });

    if (!tenant) {
      throw new Error(`Tenant not found for ID: "${tenantId}"`);
    }

    tenantSchemaCache.set(tenantId, tenant.schemaName);
    return tenant.schemaName;
  }

  // 3. Otherwise treat as a slug (replace hyphens with underscores)
  const schemaSlug = tenantId.replace(/-/g, '_');
  const safeId = sanitizeSchemaName(schemaSlug);
  return `tenant_${safeId}`;
}

// ─── Per-schema client cache ────────────────────────────────
// Prisma's model API resolves table names against the schema in the
// connection string (`?schema=`), NOT against a runtime `SET search_path`.
// We therefore bind one client per schema. Clients are CACHED (keyed by
// schema name) so we never instantiate-and-disconnect on every request —
// that was the per-request cost the architecture explicitly rules out.
// The cache is LRU-BOUNDED. Each cached client carries its own connection pool
// (Prisma default `cpus × 2 + 1`), so an unbounded cache multiplies connections
// by the number of academies ever touched, times the number of replicas — at 30+
// academies that is hundreds of connections against Neon for schemas that may
// not have been used in hours. Bounding it lets idle academies release theirs.
interface CachedClient {
  client: PrismaClient;
  /** Operations currently running on this client. Never evict while > 0. */
  inFlight: number;
  lastUsed: number;
}

const globalForTenantClients = globalThis as unknown as {
  tenantClientCache: Map<string, CachedClient> | undefined;
};

const tenantClientCache =
  globalForTenantClients.tenantClientCache ?? new Map<string, CachedClient>();

if (process.env.NODE_ENV !== 'production') {
  globalForTenantClients.tenantClientCache = tenantClientCache;
}

/**
 * Maximum tenant clients kept alive per process. Each one holds a pool, so this
 * is effectively the per-replica connection ceiling divided by the pool size —
 * track it as a capacity metric when academy count grows.
 */
const MAX_TENANT_CLIENTS = Math.max(
  1,
  parseInt(process.env.TENANT_CLIENT_CACHE_MAX ?? '25', 10) || 25
);

/**
 * Evict least-recently-used clients until the cache is under its bound.
 *
 * ⚠️ Only entries with `inFlight === 0` may be evicted. `$disconnect()` tears
 * down the pool, so disconnecting a client mid-transaction would fail live
 * requests — turning a capacity optimisation into an outage. If every entry is
 * busy we deliberately exceed the bound instead; the cap is a target, not an
 * invariant worth breaking queries for.
 *
 * `Map` iterates in insertion order and `getClientForSchema` re-inserts on every
 * hit, so the first evictable entry is the least recently used.
 */
function evictIfNeeded(): void {
  while (tenantClientCache.size >= MAX_TENANT_CLIENTS) {
    let evicted = false;

    for (const [schemaName, entry] of tenantClientCache) {
      if (entry.inFlight > 0) continue;

      tenantClientCache.delete(schemaName);
      evicted = true;

      // Fire-and-forget: the entry is already unreachable, so a slow or failing
      // disconnect must not delay the request that triggered the eviction.
      void entry.client.$disconnect().catch((err) => {
        console.error(`[tenant-client] disconnect failed for ${schemaName}:`, err);
      });
      break;
    }

    if (!evicted) break; // everything in use — grow rather than break requests
  }
}

/**
 * Snapshot of the tenant client cache.
 *
 * Each cached client holds its own connection pool, so `size` is the lever that
 * decides this process's connection ceiling against Postgres — worth exporting
 * as a capacity metric once monitoring exists, and `busy` is what to watch if
 * `size` keeps exceeding `max` (it means eviction is being blocked by load).
 */
export function getTenantClientCacheStats(): {
  size: number;
  max: number;
  busy: number;
  schemas: { schema: string; inFlight: number; idleMs: number }[];
} {
  const now = Date.now();
  const schemas = [...tenantClientCache.entries()].map(([schema, entry]) => ({
    schema,
    inFlight: entry.inFlight,
    idleMs: now - entry.lastUsed,
  }));

  return {
    size: tenantClientCache.size,
    max: MAX_TENANT_CLIENTS,
    busy: schemas.filter((s) => s.inFlight > 0).length,
    schemas,
  };
}

function getClientForSchema(safeSchemaName: string): CachedClient {
  const cached = tenantClientCache.get(safeSchemaName);
  if (cached) {
    // Re-insert to move this entry to the most-recently-used end.
    tenantClientCache.delete(safeSchemaName);
    tenantClientCache.set(safeSchemaName, cached);
    cached.lastUsed = Date.now();
    return cached;
  }

  evictIfNeeded();

  const databaseUrl = new URL(process.env.DATABASE_URL!);
  databaseUrl.searchParams.set('schema', safeSchemaName);

  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl.toString() } },
    log:
      process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  const entry: CachedClient = { client, inFlight: 0, lastUsed: Date.now() };
  tenantClientCache.set(safeSchemaName, entry);
  return entry;
}

export async function withTenantContext<T>(
  tenantId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> {
  const schemaName = await resolveTenantSchema(tenantId);

  // Re-validate the resolved schema name before it is used to build the
  // connection string. resolveTenantSchema may return a stored/derived value
  // (e.g. "tenant_acme"); strip the prefix and re-run sanitizeSchemaName so a
  // poisoned value can never reach the URL. The prefix is a constant we control.
  const bareId = schemaName.startsWith('tenant_')
    ? schemaName.slice('tenant_'.length)
    : schemaName;
  const safeSchemaName = `tenant_${sanitizeSchemaName(bareId)}`;

  const entry = getClientForSchema(safeSchemaName);

  // Mark the client busy for the whole transaction so the LRU cannot disconnect
  // it out from under us. Released in `finally` so a thrown callback (a rolled
  // back transaction, a NotFoundError) cannot leak the count and pin the entry
  // in the cache forever.
  entry.inFlight++;

  try {
    return await entry.client.$transaction(
      async (tx) => {
        // Belt-and-suspenders: also pin search_path for any raw SQL executed in
        // this transaction (raw queries are not schema-qualified by Prisma).
        // SET LOCAL is scoped to the transaction and resets on commit/rollback.
        await tx.$executeRawUnsafe(`SET LOCAL search_path = "${safeSchemaName}"`);
        return callback(tx);
      },
      {
        maxWait: options?.maxWait ?? 5000,
        timeout: options?.timeout ?? 30000,
        isolationLevel: options?.isolationLevel,
      }
    );
  } finally {
    entry.inFlight--;
    entry.lastUsed = Date.now();
  }
}

/**
 * Execute a read-only query within a tenant's schema context.
 * Shorthand for withTenantContext with READ COMMITTED isolation.
 */
export async function withTenantRead<T>(
  tenantId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return withTenantContext(tenantId, callback, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}
