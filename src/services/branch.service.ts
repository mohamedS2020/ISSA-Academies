import { withTenantContext } from '@/lib/db/tenant-client';
import { writeAuditLog, buildAuditDiff } from './audit.service';
import { BadRequestError } from '@/lib/api/error-handler';
import type { CreateBranchInput, UpdateBranchInput } from '@/schemas/branch.schema';
import { AuditAction } from '@/types';

/**
 * Provision/Create a new branch inside a tenant's schema.
 */
export async function createBranch(
  tenantId: string,
  input: CreateBranchInput,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    // Check if code is unique within this tenant schema
    const existing = await tx.branch.findUnique({
      where: { code: input.code },
    });

    if (existing) {
      throw new BadRequestError(`Branch code "${input.code}" is already in use`);
    }

    const branch = await tx.branch.create({
      data: {
        name: input.name,
        code: input.code,
        address: input.address ?? null,
        phone: input.phone ?? null,
        timezone: input.timezone,
        isActive: true,
      },
    });

    // Write audit log
    await writeAuditLog(tx, {
      branchId: branch.id,
      userId: executorId,
      action: AuditAction.CREATE,
      entityType: 'branch',
      entityId: branch.id,
      newValues: branch as unknown as Record<string, unknown>,
    });

    return branch;
  });
}

/**
 * List all branches in the tenant's schema.
 */
export async function listBranches(tenantId: string, includeInactive = true) {
  return withTenantContext(tenantId, async (tx) => {
    return tx.branch.findMany({
      where: !includeInactive ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  });
}

/**
 * Retrieve a branch by ID.
 */
export async function getBranchById(tenantId: string, branchId: string) {
  return withTenantContext(tenantId, async (tx) => {
    return tx.branch.findUnique({
      where: { id: branchId },
    });
  });
}

/**
 * Update branch details.
 */
export async function updateBranch(
  tenantId: string,
  branchId: string,
  input: UpdateBranchInput,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const oldBranch = await tx.branch.findUnique({
      where: { id: branchId },
    });

    if (!oldBranch) {
      throw new BadRequestError('Branch not found');
    }

    const updated = await tx.branch.update({
      where: { id: branchId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.payrollFrequency !== undefined && {
          payrollFrequency: input.payrollFrequency,
        }),
        ...(input.payrollCustomDays !== undefined && {
          payrollCustomDays: input.payrollCustomDays,
        }),
      },
    });

    // Calculate difference for audit log
    const diff = buildAuditDiff(
      oldBranch as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>
    );
    if (diff) {
      await writeAuditLog(tx, {
        branchId: updated.id,
        userId: executorId,
        action: AuditAction.UPDATE,
        entityType: 'branch',
        entityId: updated.id,
        oldValues: diff.old,
        newValues: diff.new,
      });
    }

    return updated;
  });
}

/**
 * Deactivate a branch.
 */
export async function deactivateBranch(
  tenantId: string,
  branchId: string,
  executorId: string
) {
  return updateBranch(tenantId, branchId, { isActive: false }, executorId);
}

/**
 * Reactivate a branch.
 */
export async function reactivateBranch(
  tenantId: string,
  branchId: string,
  executorId: string
) {
  return updateBranch(tenantId, branchId, { isActive: true }, executorId);
}

/**
 * Retrieve the timezone of a branch.
 */
export async function getBranchTimezone(
  tenantId: string,
  branchId: string
): Promise<string> {
  return withTenantContext(tenantId, async (tx) => {
    const branch = await tx.branch.findUnique({
      where: { id: branchId },
      select: { timezone: true },
    });

    return branch?.timezone ?? 'Africa/Cairo';
  });
}
