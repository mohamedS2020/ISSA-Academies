/**
 * Captain Management Service
 *
 * Handles registration, listing, edit, and deactivation of captains.
 *
 * Key behaviors:
 *   - Creates User (role=CAPTAIN) + CaptainProfile in one atomic tx
 *   - Portal password returned ONCE — never stored in plain text
 *   - payrollType determines which rate fields are required (validated in schema)
 *   - Every query includes { branchId } for strict branch isolation
 *   - The login follows every change in the same transaction (syncLoginIndex,
 *     login-index.ts). Never write user_phone_index directly.
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { hashPassword, passwordFromPhone } from '@/lib/auth/password';
import { writeAuditLog, buildAuditDiff } from './audit.service';
import { getCaptainRatingSummary, getCaptainRatingSummaries } from './rating.service';
import { syncLoginIndex, assertPhoneAvailable, withPhoneGuard } from './login-index';
import { NotFoundError } from '@/lib/api/error-handler';
import { AuditAction, UserRole } from '@/types';
import type {
  CreateCaptainInput,
  UpdateCaptainInput,
  ListCaptainsQuery,
} from '@/schemas/captain.schema';

// ─── Create Captain ───────────────────────────────────────────

/**
 * Register a new captain. Creates:
 *   1. User record (role=CAPTAIN, auto-generated portal password)
 *   2. CaptainProfile with payroll info and attending days
 *   3. Its login
 * all in one transaction.
 *
 * Returns the captain + portal password (shown ONCE to admin).
 */
export async function createCaptain(
  tenantId: string,
  branchId: string,
  input: CreateCaptainInput,
  executorId: string
) {
  const portalPassword = passwordFromPhone(input.phoneNumber);
  const passwordHash = await hashPassword(portalPassword);

  const { captain } = await withPhoneGuard(() => withTenantContext(tenantId, async (tx) => {
    // A phone signs in to one account per academy, not per branch (§26).
    await assertPhoneAvailable(tx, input.phoneNumber, branchId);

    // 1. Create the User account
    const newUser = await tx.user.create({
      data: {
        branchId,
        name: input.name,
        phoneNumber: input.phoneNumber,
        passwordHash,
        role: UserRole.CAPTAIN,
        language: input.language ?? 'en',
        isActive: true,
      },
    });

    // 2. Create CaptainProfile
    const newCaptain = await tx.captainProfile.create({
      data: {
        userId: newUser.id,
        branchId,
        specialization: input.specialization ?? null,
        attendingDays: input.attendingDays,
        payrollType: input.payrollType,
        hourlyRate: input.hourlyRate ?? null,
        baseSalary: input.baseSalary ?? null,
        percentage: input.percentage ?? null,
      },
      include: {
        user: { select: { name: true, phoneNumber: true } },
      },
    });

    // 3. Audit log
    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.CREATE,
      entityType: 'captain',
      entityId: newCaptain.id,
      newValues: {
        name: newUser.name,
        phoneNumber: newUser.phoneNumber,
        payrollType: input.payrollType,
        attendingDays: input.attendingDays,
      },
    });

    // 4. Its login, in the same transaction
    await syncLoginIndex(tx, tenantId, newUser.id);

    return { user: newUser, captain: newCaptain };
  }));

  // Return portal password ONCE
  return { captain, portalPassword };
}

// ─── List Captains ────────────────────────────────────────────

/**
 * List captains for a branch with pagination and optional search/filter.
 */
export async function listCaptains(
  tenantId: string,
  branchId: string,
  query: ListCaptainsQuery
) {
  return withTenantContext(tenantId, async (tx) => {
    const { page, limit, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where = {
      branchId,
      ...(isActive !== undefined && {
        user: { isActive },
      }),
      ...(search && {
        user: {
          name: { contains: search, mode: 'insensitive' as const },
        },
      }),
    };

    const [captains, total] = await Promise.all([
      tx.captainProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              name: true,
              phoneNumber: true,
              isActive: true,
              language: true,
            },
          },
          _count: { select: { groups: true } },
        },
      }),
      tx.captainProfile.count({ where }),
    ]);

    // Attach each captain's cumulative rating (average + count) beside them.
    const ratings = await getCaptainRatingSummaries(tx, captains.map((c) => c.id));
    const captainsWithRating = captains.map((c) => ({
      ...c,
      rating: ratings.get(c.id) ?? { average: null, count: 0 },
    }));

    return { captains: captainsWithRating, total };
  });
}

// ─── Get Captain By ID ────────────────────────────────────────

/**
 * Retrieve a single captain with full profile and groups, enforcing branch isolation.
 */
export async function getCaptainById(
  tenantId: string,
  branchId: string,
  captainId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const captain = await tx.captainProfile.findFirst({
      where: { id: captainId, branchId },
      include: {
        user: {
          select: {
            name: true,
            phoneNumber: true,
            isActive: true,
            language: true,
            lastLoginAt: true,
          },
        },
        groups: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            scheduleDays: true,
            startTime: true,
            _count: { select: { trainees: true } },
          },
        },
      },
    });

    if (!captain) {
      throw new NotFoundError('Captain not found');
    }

    const rating = await getCaptainRatingSummary(tx, captain.id);
    return { ...captain, rating };
  });
}

// ─── Update Captain ───────────────────────────────────────────

/**
 * Update captain profile and/or user details. The login follows in the same
 * transaction: a new phone signs in, reactivation restores sign-in,
 * deactivation removes it.
 */
export async function updateCaptain(
  tenantId: string,
  branchId: string,
  captainId: string,
  input: UpdateCaptainInput,
  executorId: string
) {
  const updated = await withPhoneGuard(() => withTenantContext(tenantId, async (tx) => {
    const existing = await tx.captainProfile.findFirst({
      where: { id: captainId, branchId },
      include: {
        user: { select: { id: true, name: true, phoneNumber: true, isActive: true } },
      },
    });

    if (!existing) throw new NotFoundError('Captain not found');

    // If the account is active afterwards, nobody else in the academy may be
    // signing in with its phone. Covers a phone change and a reactivation.
    if (input.isActive ?? existing.user.isActive) {
      await assertPhoneAvailable(
        tx,
        input.phoneNumber ?? existing.user.phoneNumber,
        branchId,
        existing.userId
      );
    }

    // Update User fields if provided
    const userUpdates: Record<string, unknown> = {};
    if (input.name !== undefined) userUpdates.name = input.name;
    if (input.phoneNumber !== undefined) userUpdates.phoneNumber = input.phoneNumber;
    if (input.isActive !== undefined) userUpdates.isActive = input.isActive;

    if (Object.keys(userUpdates).length > 0) {
      await tx.user.update({
        where: { id: existing.userId },
        data: userUpdates,
      });
    }

    // Update CaptainProfile fields
    const updatedCaptain = await tx.captainProfile.update({
      where: { id: captainId },
      data: {
        ...(input.specialization !== undefined && {
          specialization: input.specialization,
        }),
        ...(input.attendingDays !== undefined && {
          attendingDays: input.attendingDays,
        }),
        ...(input.payrollType !== undefined && { payrollType: input.payrollType }),
        ...(input.hourlyRate !== undefined && { hourlyRate: input.hourlyRate }),
        ...(input.baseSalary !== undefined && { baseSalary: input.baseSalary }),
        ...(input.percentage !== undefined && { percentage: input.percentage }),
      },
      include: {
        user: { select: { name: true, phoneNumber: true, isActive: true } },
      },
    });

    const diff = buildAuditDiff(
      existing as unknown as Record<string, unknown>,
      updatedCaptain as unknown as Record<string, unknown>
    );
    if (diff) {
      await writeAuditLog(tx, {
        branchId,
        userId: executorId,
        action: AuditAction.UPDATE,
        entityType: 'captain',
        entityId: captainId,
        oldValues: diff.old,
        newValues: diff.new,
      });
    }

    await syncLoginIndex(tx, tenantId, existing.userId);
    return updatedCaptain;
  }));

  return updated;
}

// ─── Deactivate Captain ───────────────────────────────────────

/**
 * Deactivate a captain (soft delete). Removes from platform phone index.
 */
export async function deactivateCaptain(
  tenantId: string,
  branchId: string,
  captainId: string,
  executorId: string
) {
  await withTenantContext(tenantId, async (tx) => {
    const captain = await tx.captainProfile.findFirst({
      where: { id: captainId, branchId },
      select: { userId: true },
    });

    if (!captain) throw new NotFoundError('Captain not found');

    await tx.user.update({
      where: { id: captain.userId },
      data: { isActive: false },
    });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'captain',
      entityId: captainId,
      newValues: { isActive: false },
    });

    await syncLoginIndex(tx, tenantId, captain.userId);
  });

  return { success: true };
}
