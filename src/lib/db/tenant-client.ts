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

// ─── Singleton tenant Prisma client ─────────────────────────
// We use a SINGLE PrismaClient instance for all tenants.
// Schema isolation is handled by SET LOCAL inside each transaction.
const globalForPrisma = globalThis as unknown as {
  tenantPrisma: PrismaClient | undefined;
};

const tenantPrisma =
  globalForPrisma.tenantPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.tenantPrisma = tenantPrisma;
}

export { tenantPrisma };

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
const globalForTenantClients = globalThis as unknown as {
  tenantClientCache: Map<string, PrismaClient> | undefined;
};

const tenantClientCache =
  globalForTenantClients.tenantClientCache ?? new Map<string, PrismaClient>();

if (process.env.NODE_ENV !== 'production') {
  globalForTenantClients.tenantClientCache = tenantClientCache;
}

function getClientForSchema(safeSchemaName: string): PrismaClient {
  const cached = tenantClientCache.get(safeSchemaName);
  if (cached) return cached;

  const databaseUrl = new URL(process.env.DATABASE_URL!);
  databaseUrl.searchParams.set('schema', safeSchemaName);

  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl.toString() } },
    log:
      process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  tenantClientCache.set(safeSchemaName, client);
  return client;
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

  const client = getClientForSchema(safeSchemaName);

  return client.$transaction(
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
