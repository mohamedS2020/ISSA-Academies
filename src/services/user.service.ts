/**
 * ISSA — User Management Service
 *
 * Handles CRUD for Admin and Moderator accounts within a tenant branch.
 * Only Admin and Moderator roles are managed here — Captains and Trainees
 * have their own dedicated services with profile creation.
 *
 * Branch isolation: every query includes { branchId } in the where clause.
 * Audit log: all write operations are logged within the same transaction.
 * Phone index: platformPrisma.userPhoneIndex is kept in sync on create/deactivate.
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { hashPassword, generateRandomPassword } from '@/lib/auth/password';
import { writeAuditLog, buildAuditDiff } from './audit.service';
import { BadRequestError, NotFoundError, ConflictError } from '@/lib/api/error-handler';
import { AuditAction, UserRole } from '@/types';
import { filterValidPrivileges } from '@/lib/auth/permissions';
import type {
  CreateUserInput,
  UpdateUserInput,
  SetPrivilegesInput,
  ListUsersQuery,
} from '@/schemas/user.schema';

// ─── List Users ───────────────────────────────────────────────

/**
 * List Admin and Moderator accounts for a branch with optional filters.
 */
export async function listUsers(
  tenantId: string,
  branchId: string,
  query: ListUsersQuery
) {
  return withTenantContext(tenantId, async (tx) => {
    const { page, limit, role, isActive, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      branchId,
      role: role
        ? ({ in: [role] } as any)
        : ({ in: [UserRole.ADMIN, UserRole.MODERATOR] } as any),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { phoneNumber: { contains: search } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      tx.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { privileges: { select: { privilege: true } } },
      }),
      tx.user.count({ where }),
    ]);

    return {
      users: users.map((u) => {
        const { privileges, ...rest } = u as any;
        return {
          ...rest,
          privileges: (privileges ?? []).map((p: any) => p.privilege),
          passwordHash: undefined,
        };
      }),
      total,
    };
  });
}

// ─── Get User By ID ───────────────────────────────────────────

/**
 * Retrieve a single user by ID, enforcing branch isolation.
 */
export async function getUserById(
  tenantId: string,
  branchId: string,
  userId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, branchId },
      include: { privileges: { select: { privilege: true } } },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      ...user,
      privileges: user.privileges.map((p) => p.privilege),
      passwordHash: undefined,
    };
  });
}

// ─── Create User ──────────────────────────────────────────────

/**
 * Create an Admin or Moderator user within a branch.
 * Also inserts into platformPrisma.userPhoneIndex for login routing.
 */
export async function createUser(
  tenantId: string,
  branchId: string,
  input: CreateUserInput,
  executorId: string
) {
  // Check for duplicate phone within the same branch (tenant client)
  const existing = await withTenantContext(tenantId, async (tx) => {
    return tx.user.findFirst({
      where: { branchId, phoneNumber: input.phoneNumber },
      select: { id: true },
    });
  });

  if (existing) {
    throw new ConflictError(
      `Phone number ${input.phoneNumber} is already registered in this branch`
    );
  }

  const passwordHash = await hashPassword(input.password);

  const user = await withTenantContext(tenantId, async (tx) => {
    const newUser = await tx.user.create({
      data: {
        branchId,
        name: input.name,
        phoneNumber: input.phoneNumber,
        passwordHash,
        role: input.role as any,
        language: input.language ?? 'en',
        isActive: true,
      },
    });

    // Set moderator privileges if applicable
    if (input.role === UserRole.MODERATOR && input.privileges.length > 0) {
      const validPrivileges = filterValidPrivileges(input.privileges as string[]);
      await tx.userPrivilege.createMany({
        data: validPrivileges.map((p) => ({
          userId: newUser.id,
          privilege: p,
        })),
      });
    }

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.CREATE,
      entityType: 'user',
      entityId: newUser.id,
      newValues: {
        name: newUser.name,
        phoneNumber: newUser.phoneNumber,
        role: newUser.role,
        privileges: input.privileges,
      },
    });

    return newUser;
  });

  // Sync platform phone index for login routing
  await platformPrisma.userPhoneIndex.upsert({
    where: {
      phoneNumber_tenantId: {
        phoneNumber: input.phoneNumber,
        tenantId,
      },
    },
    create: {
      phoneNumber: input.phoneNumber,
      tenantId,
      userId: user.id,
      branchId,
      role: input.role,
    },
    update: {
      userId: user.id,
      branchId,
      role: input.role,
    },
  });

  return { ...user, passwordHash: undefined };
}

// ─── Update User ──────────────────────────────────────────────

/**
 * Update user details (name, phone, isActive, language).
 * If phone changes, updates the platform phone index accordingly.
 */
export async function updateUser(
  tenantId: string,
  branchId: string,
  userId: string,
  input: UpdateUserInput,
  executorId: string
) {
  // Check new phone doesn't conflict with another user
  if (input.phoneNumber) {
    const conflict = await withTenantContext(tenantId, async (tx) => {
      return tx.user.findFirst({
        where: {
          branchId,
          phoneNumber: input.phoneNumber,
          NOT: { id: userId },
        },
        select: { id: true },
      });
    });

    if (conflict) {
      throw new ConflictError(
        `Phone number ${input.phoneNumber} is already registered by another user`
      );
    }
  }

  const updated = await withTenantContext(tenantId, async (tx) => {
    const old = await tx.user.findFirst({
      where: { id: userId, branchId },
    });

    if (!old) throw new NotFoundError('User not found');

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phoneNumber !== undefined && { phoneNumber: input.phoneNumber }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.language !== undefined && { language: input.language }),
      },
    });

    const diff = buildAuditDiff(
      old as unknown as Record<string, unknown>,
      updatedUser as unknown as Record<string, unknown>
    );
    if (diff) {
      await writeAuditLog(tx, {
        branchId,
        userId: executorId,
        action: AuditAction.UPDATE,
        entityType: 'user',
        entityId: userId,
        oldValues: diff.old,
        newValues: diff.new,
      });
    }

    return updatedUser;
  });

  // Update phone index if phone changed
  if (input.phoneNumber) {
    await platformPrisma.userPhoneIndex.updateMany({
      where: { userId, tenantId },
      data: { phoneNumber: input.phoneNumber },
    });
  }

  // Remove from phone index if deactivated
  if (input.isActive === false) {
    await platformPrisma.userPhoneIndex.deleteMany({
      where: { userId, tenantId },
    });
  }

  return { ...updated, passwordHash: undefined };
}

// ─── Set Moderator Privileges ─────────────────────────────────

/**
 * Replace all privileges for a Moderator user atomically.
 * Delete-then-create inside one transaction to prevent partial states.
 */
export async function setPrivileges(
  tenantId: string,
  branchId: string,
  userId: string,
  input: SetPrivilegesInput,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, branchId, role: UserRole.MODERATOR },
    });

    if (!user) {
      throw new NotFoundError('Moderator user not found');
    }

    const validPrivileges = filterValidPrivileges(input.privileges as string[]);

    // Atomic delete + re-create
    await tx.userPrivilege.deleteMany({ where: { userId } });

    if (validPrivileges.length > 0) {
      await tx.userPrivilege.createMany({
        data: validPrivileges.map((p) => ({ userId, privilege: p })),
      });
    }

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.UPDATE,
      entityType: 'user_privileges',
      entityId: userId,
      newValues: { privileges: validPrivileges },
    });

    return { userId, privileges: validPrivileges };
  });
}

// ─── Deactivate User ──────────────────────────────────────────

/**
 * Deactivate a user (soft delete). Removes from platform phone index.
 */
export async function deactivateUser(
  tenantId: string,
  branchId: string,
  userId: string,
  executorId: string
) {
  const updated = await withTenantContext(tenantId, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, branchId },
    });

    if (!user) throw new NotFoundError('User not found');
    if (userId === executorId) {
      throw new BadRequestError('You cannot deactivate your own account');
    }

    const deactivated = await tx.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'user',
      entityId: userId,
      newValues: { isActive: false },
    });

    return deactivated;
  });

  await platformPrisma.userPhoneIndex.deleteMany({
    where: { userId, tenantId },
  });

  return { ...updated, passwordHash: undefined };
}

// ─── Admin-Initiated Password Reset ──────────────────────────

/**
 * Generate a new random password for a user. Returns the plain password
 * once — admin is responsible for sharing it with the user.
 */
export async function resetUserPassword(
  tenantId: string,
  branchId: string,
  userId: string,
  executorId: string
): Promise<{ newPassword: string }> {
  const newPassword = generateRandomPassword();
  const passwordHash = await hashPassword(newPassword);

  await withTenantContext(tenantId, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, branchId },
    });

    if (!user) throw new NotFoundError('User not found');

    await tx.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.PASSWORD_RESET,
      entityType: 'user',
      entityId: userId,
      newValues: { resetBy: executorId },
    });
  });

  return { newPassword };
}
