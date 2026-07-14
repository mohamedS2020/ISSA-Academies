/**
 * ISSA — Tenant Service
 *
 * Core business logic for tenant (academy) management:
 *   - Provisioning (schema creation + migrations + default admin)
 *   - CRUD operations
 *   - Status management (suspend, reactivate, delete)
 *   - Usage statistics
 *
 * ⚠️ CRITICAL: CREATE SCHEMA is DDL — cannot be wrapped in a Prisma
 *    transaction. If migrations or seeding fail after the schema was
 *    created, cleanup happens in the catch block.
 */

import { platformPrisma } from '@/lib/db/platform-client';
import { withTenantContext } from '@/lib/db/tenant-client';
import {
  provisionTenantSchema,
  dropTenantSchema,
  sanitizeSchemaName,
} from '@/lib/db/migration-runner';
import { hashPassword, generateRandomPassword } from '@/lib/auth/password';
import type { CreateTenantInput, UpdateTenantInput } from '@/schemas/tenant.schema';
import { isValidStatusTransition } from '@/schemas/tenant.schema';
import { randomUUID } from 'crypto';

// ─── Types ──────────────────────────────────────────────────

export interface TenantWithConfig {
  id: string;
  name: string;
  slug: string;
  status: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  schemaName: string;
  maxBranches: number;
  createdAt: Date;
  updatedAt: Date;
  config: {
    currency: string;
    defaultTimezone: string;
  } | null;
}

export interface ProvisioningResult {
  tenant: TenantWithConfig;
  adminCredentials: {
    name: string;
    phoneNumber: string;
    password: string;
  };
  branch: {
    name: string;
    code: string;
    timezone: string;
  };
}

export interface TenantUsageStats {
  tenantId: string;
  activeUsers: number;
  totalTrainees: number;
  activeSubscriptions: number;
  totalBranches: number;
  totalGroups: number;
}

export interface TenantListFilters {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Create Tenant (Full Provisioning) ──────────────────────

/**
 * Provision a new tenant — full workflow:
 *   1. Create tenant record in platform DB
 *   2. Create PostgreSQL schema (DDL — cannot be in a transaction)
 *   3. Run Prisma migrations against the new schema
 *   4. Seed default Admin account in tenant schema
 *   5. Create phone index entry for the admin
 *
 * ⚠️ On failure after schema creation, cleanup drops the schema
 *    and deletes the platform record to avoid orphans.
 */
export async function createTenant(
  input: CreateTenantInput
): Promise<ProvisioningResult> {
  // Derive a safe schema name from the slug
  const schemaSlug = input.slug.replace(/-/g, '_');
  const safeId = sanitizeSchemaName(schemaSlug);
  const schemaName = `tenant_${safeId}`;
  // Provisioning runs DDL + `migrate deploy`, which a connection pooler
  // (Neon/PgBouncer) cannot handle — use the DIRECT (non-pooled) URL. Runtime
  // queries still go through the pooled DATABASE_URL via the tenant client.
  const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;

  // Generate the admin password
  const adminPassword = generateRandomPassword();
  const adminPasswordHash = await hashPassword(adminPassword);

  let tenantId: string | null = null;

  try {
    // Step 1: Create tenant record in platform DB
    const tenant = await platformPrisma.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        status: 'ACTIVE',
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        contactEmail: input.contactEmail ?? null,
        schemaName,
        maxBranches: 10,
        config: {
          create: {
            currency: 'EGP',
            defaultTimezone: input.branchTimezone,
          },
        },
      },
      include: { config: true },
    });
    tenantId = tenant.id;

    // Step 2 + 3: Create schema and run migrations
    await provisionTenantSchema(schemaSlug, databaseUrl);

    // Step 4: Seed default branch + admin inside the tenant schema
    const branchId = randomUUID();
    const adminUserId = randomUUID();

    await withTenantContext(tenant.id, async (tx) => {
      // Create the default branch via the Prisma model API.
      // search_path is set to the tenant schema by withTenantContext, so these
      // writes land in the correct schema. Using the model API (not raw SQL)
      // eliminates the SQL-injection surface from interpolated user input.
      await tx.branch.create({
        data: {
          id: branchId,
          name: input.branchName,
          code: input.branchCode,
          timezone: input.branchTimezone,
          isActive: true,
        },
      });

      // Create the default admin user
      await tx.user.create({
        data: {
          id: adminUserId,
          branchId,
          name: input.adminName,
          phoneNumber: input.adminPhone,
          passwordHash: adminPasswordHash,
          role: 'ADMIN',
          isActive: true,
          language: 'en',
        },
      });
    });

    // Step 5: Create phone index entry for the admin
    await platformPrisma.userPhoneIndex.create({
      data: {
        phoneNumber: input.adminPhone,
        tenantId: tenant.id,
        userId: adminUserId,
        branchId,
        role: 'ADMIN',
      },
    });

    return {
      tenant: tenant as TenantWithConfig,
      adminCredentials: {
        name: input.adminName,
        phoneNumber: input.adminPhone,
        password: adminPassword,
      },
      branch: {
        name: input.branchName,
        code: input.branchCode,
        timezone: input.branchTimezone,
      },
    };
  } catch (err) {
    // ⚠️ Cleanup on failure — drop schema and delete platform record
    console.error('[ISSA] Tenant provisioning failed, cleaning up...', err);

    await dropTenantSchema(schemaSlug, databaseUrl).catch((e) =>
      console.error('[ISSA] Schema cleanup failed:', e)
    );

    if (tenantId) {
      await platformPrisma.tenant
        .delete({ where: { id: tenantId } })
        .catch((e) =>
          console.error('[ISSA] Tenant record cleanup failed:', e)
        );
    }

    throw err;
  }
}

// ─── List Tenants ───────────────────────────────────────────

export async function listTenants(filters: TenantListFilters = {}) {
  const { status, search, page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (status && status !== 'ALL') {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { contactName: { contains: search, mode: 'insensitive' } },
      { contactEmail: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [tenants, total] = await Promise.all([
    platformPrisma.tenant.findMany({
      where,
      include: { config: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    platformPrisma.tenant.count({ where }),
  ]);

  return { tenants, total, page, limit };
}

// ─── Get Tenant By ID ───────────────────────────────────────

export async function getTenantById(
  id: string
): Promise<TenantWithConfig | null> {
  const tenant = await platformPrisma.tenant.findUnique({
    where: { id },
    include: { config: true },
  });

  return tenant as TenantWithConfig | null;
}

// ─── Update Tenant ──────────────────────────────────────────

export async function updateTenant(id: string, data: UpdateTenantInput) {
  const tenant = await platformPrisma.tenant.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.contactName !== undefined && { contactName: data.contactName }),
      ...(data.contactPhone !== undefined && {
        contactPhone: data.contactPhone,
      }),
      ...(data.contactEmail !== undefined && {
        contactEmail: data.contactEmail,
      }),
      ...(data.maxBranches !== undefined && { maxBranches: data.maxBranches }),
    },
    include: { config: true },
  });

  return tenant;
}

// ─── Change Tenant Status ───────────────────────────────────

export async function changeTenantStatus(
  id: string,
  newStatus: string
): Promise<TenantWithConfig> {
  const tenant = await platformPrisma.tenant.findUnique({
    where: { id },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${id}`);
  }

  if (!isValidStatusTransition(tenant.status, newStatus)) {
    throw new Error(
      `Invalid status transition: ${tenant.status} → ${newStatus}`
    );
  }

  const updated = await platformPrisma.tenant.update({
    where: { id },
    data: { status: newStatus as 'ACTIVE' | 'SUSPENDED' | 'DELETED' },
    include: { config: true },
  });

  // On DELETED, enforce the delete: remove the login lookup entries so no user
  // of this tenant can authenticate, and drop the tenant's PostgreSQL schema.
  // Without this, a "deleted" tenant's admin could still log in and its schema
  // would linger as an orphan. The platform record is retained (soft-delete)
  // for audit/history, but it is now non-functional.
  if (newStatus === 'DELETED') {
    await platformPrisma.userPhoneIndex
      .deleteMany({ where: { tenantId: id } })
      .catch((e) =>
        console.error(
          `[ISSA] Phone-index cleanup failed for deleted tenant ${id}:`,
          e
        )
      );

    // DROP SCHEMA is DDL — use the DIRECT (non-pooled) connection.
    const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
    const schemaSlug = updated.slug.replace(/-/g, '_');
    await dropTenantSchema(schemaSlug, databaseUrl).catch((e) =>
      console.error(
        `[ISSA] Schema drop failed for deleted tenant ${id}:`,
        e
      )
    );
  }

  return updated as TenantWithConfig;
}

// ─── Tenant Usage Stats ─────────────────────────────────────

/**
 * Get aggregate usage statistics for a tenant by querying
 * across the tenant's PostgreSQL schema.
 *
 * These are read-only aggregate queries — safe for monitoring.
 */
export async function getTenantUsageStats(
  tenantId: string
): Promise<TenantUsageStats> {
  try {
    const stats = await withTenantContext(tenantId, async (tx) => {
      // Run aggregate queries in parallel
      const [
        activeUsersResult,
        totalTraineesResult,
        activeSubsResult,
        totalBranchesResult,
        totalGroupsResult,
      ] = await Promise.all([
        tx.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*) as count FROM "users" WHERE "is_active" = true`
        ),
        tx.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*) as count FROM "trainee_profiles"`
        ),
        tx.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*) as count FROM "trainee_subscriptions" WHERE "status" = 'ACTIVE'`
        ),
        tx.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*) as count FROM "branches" WHERE "is_active" = true`
        ),
        tx.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*) as count FROM "groups"`
        ),
      ]);

      return {
        tenantId,
        activeUsers: Number(activeUsersResult[0]?.count ?? 0),
        totalTrainees: Number(totalTraineesResult[0]?.count ?? 0),
        activeSubscriptions: Number(activeSubsResult[0]?.count ?? 0),
        totalBranches: Number(totalBranchesResult[0]?.count ?? 0),
        totalGroups: Number(totalGroupsResult[0]?.count ?? 0),
      };
    });

    return stats;
  } catch (err) {
    // Postgres error 3F000 = "invalid_schema_name", 42P01 = "undefined_table".
    // For a not-yet-provisioned (or dropped) tenant schema we legitimately
    // return zeros. Any other failure is a real error and must surface, not be
    // silently masked as "0 everything".
    const code = (err as { code?: string }).code;
    const isMissingSchema = code === '3F000' || code === '42P01';

    if (isMissingSchema) {
      return {
        tenantId,
        activeUsers: 0,
        totalTrainees: 0,
        activeSubscriptions: 0,
        totalBranches: 0,
        totalGroups: 0,
      };
    }

    console.error(
      `[ISSA] getTenantUsageStats failed for tenant ${tenantId}:`,
      err
    );
    throw err;
  }
}
