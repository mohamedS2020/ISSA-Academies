/**
 * ISSA — Tenant Schema Migration Runner
 *
 * Handles programmatic creation of tenant PostgreSQL schemas and
 * running migrations against them during tenant provisioning.
 *
 * SECURITY: sanitizeSchemaName() strips any character that isn't
 * a letter, digit, or underscore — then rejects the input if it
 * was altered. This prevents SQL injection via crafted tenant IDs
 * like `x; DROP SCHEMA tenant_legit`.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Sanitize a tenant ID for safe interpolation into SQL identifiers.
 *
 * Strips everything that is not a letter, digit, or underscore,
 * then compares back to the original. If they differ, the input
 * contained unsafe characters and is rejected.
 *
 * @param tenantId - Raw tenant identifier
 * @returns Sanitized tenant ID (same as input if valid)
 * @throws Error if the tenant ID contains invalid characters
 *
 * @example
 * sanitizeSchemaName('acme123')     // → 'acme123'
 * sanitizeSchemaName('x; DROP')     // → throws Error
 * sanitizeSchemaName('')            // → throws Error
 */
export function sanitizeSchemaName(tenantId: string): string {
  if (!tenantId) {
    throw new Error('Tenant ID cannot be empty');
  }

  const safe = tenantId.replace(/[^a-z0-9_]/gi, '');

  if (!safe || safe !== tenantId) {
    throw new Error(
      `Invalid tenant ID: "${tenantId}" — only letters, digits, and underscores are allowed`
    );
  }

  // Additional length check — PostgreSQL identifiers max 63 chars
  // "tenant_" prefix takes 7, leaving 56 for the ID
  if (safe.length > 56) {
    throw new Error(
      `Tenant ID too long: "${tenantId}" (max 56 characters)`
    );
  }

  return safe;
}

/**
 * Get the full schema name for a tenant.
 */
export function getTenantSchemaName(tenantId: string): string {
  const schemaSlug = tenantId.replace(/-/g, '_');
  const safeId = sanitizeSchemaName(schemaSlug);
  return `tenant_${safeId}`;
}

/**
 * Create a new tenant PostgreSQL schema and run migrations.
 *
 * This is called during tenant provisioning (Super Admin → Create Tenant).
 * It is idempotent — safe to re-run on an existing schema.
 *
 * Steps:
 *   1. CREATE SCHEMA IF NOT EXISTS tenant_{id}
 *   2. Run Prisma migrations against that schema
 *
 * ⚠️ CREATE SCHEMA is DDL — it cannot be wrapped in a Prisma transaction.
 *    If migrations fail after schema creation, the caller must handle
 *    cleanup (DROP SCHEMA) in a catch block. See tenant.service.ts.
 *
 * @param tenantId - The tenant identifier to provision
 * @param databaseUrl - The database connection URL (pointing to PgBouncer or direct)
 */
export async function provisionTenantSchema(
  tenantId: string,
  databaseUrl: string
): Promise<void> {
  const schemaName = getTenantSchemaName(tenantId);

  // Dynamic import to avoid pulling Prisma into edge runtime
  const { PrismaClient } = await import('@/generated/platform-client');
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    // Step 1: Create the schema (DDL — cannot be in a transaction)
    await prisma.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`
    );

    // Step 2: Run tenant migrations using Prisma CLI
    // We use the tenant-schema.prisma with the schema set via search_path
    const tenantSchemaPath = path.resolve(
      process.cwd(),
      'prisma',
      'tenant-schema.prisma'
    );

    // Build a connection URL that sets the search_path to the tenant schema
    const url = new URL(databaseUrl);
    url.searchParams.set('schema', schemaName);
    const tenantDbUrl = url.toString();

    const prismaCliPath = path.resolve(
      process.cwd(),
      'node_modules',
      'prisma',
      'build',
      'index.js'
    );

    try {
      // ⚠️ Set BOTH url and directUrl to the schema-scoped connection string.
      // The Prisma CLI subprocess re-loads .env on its own — dotenv only
      // fills in vars that are NOT already set, so deleting DIRECT_DATABASE_URL
      // (instead of overriding it) lets that reload silently restore the
      // original non-scoped value from .env, pointing `directUrl` (which
      // migrations actually use) at the wrong schema. Explicitly setting
      // both prevents that.
      const runEnv = { ...process.env };
      runEnv.DATABASE_URL = tenantDbUrl;
      runEnv.DIRECT_DATABASE_URL = tenantDbUrl;

      await execAsync(
        `node "${prismaCliPath}" migrate deploy --schema="${tenantSchemaPath}"`,
        {
          env: runEnv,
        }
      );
    } catch (execErr: unknown) {
      const err = execErr as Error & { stdout?: string; stderr?: string };
      console.error('[ISSA] Migration command failed.');
      console.error('[ISSA] stdout:', err.stdout);
      console.error('[ISSA] stderr:', err.stderr);
      throw execErr;
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Drop a tenant schema and all its data.
 *
 * ⚠️ DESTRUCTIVE — only used for cleanup on failed provisioning
 * or when deleting a tenant. Never call this in normal operation.
 *
 * @param tenantId - The tenant identifier to drop
 * @param databaseUrl - The database connection URL
 */
export async function dropTenantSchema(
  tenantId: string,
  databaseUrl: string
): Promise<void> {
  const schemaName = getTenantSchemaName(tenantId);

  const { PrismaClient } = await import('@/generated/platform-client');
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await prisma.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`
    );
  } finally {
    await prisma.$disconnect();
  }
}
