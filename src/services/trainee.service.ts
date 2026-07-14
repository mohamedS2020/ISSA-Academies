/**
 * ISSA — Trainee Management Service
 *
 * Handles registration, listing, search, edit, and deactivation of trainees.
 *
 * Key behaviors:
 *   - System code format: ISSA-{BRANCHCODE}-{PADDED_SEQ} generated atomically in tx
 *   - On registration: auto-create User (role=TRAINEE) + TraineeProfile in one tx
 *   - Portal password returned ONCE — never stored in plain text
 *   - Every query includes { branchId } for strict branch isolation
 *   - Platform phone index kept in sync
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { hashPassword, passwordFromPhone } from '@/lib/auth/password';
import { writeAuditLog, buildAuditDiff } from './audit.service';
import { BadRequestError, NotFoundError, ConflictError } from '@/lib/api/error-handler';
import { AuditAction, UserRole } from '@/types';
import type {
  CreateTraineeInput,
  UpdateTraineeInput,
  UpdateAssignmentInput,
  ListTraineesQuery,
  SearchTraineeQuery,
} from '@/schemas/trainee.schema';

// ─── System Code Generation ───────────────────────────────────

/**
 * Generate the next sequential trainee system code for a branch.
 * Format: ISSA-{BRANCHCODE}-{6-digit padded sequence}
 *
 * ⚠️ MUST be called INSIDE the same transaction as the INSERT.
 *    Running outside the tx creates a race condition where two concurrent
 *    registrations get the same sequence number.
 */
async function generateSystemCode(
  tx: Parameters<Parameters<typeof withTenantContext>[1]>[0],
  branchId: string,
  branchCode: string
): Promise<string> {
  // Find the highest existing sequence for this branch
  const last = await tx.traineeProfile.findFirst({
    where: { branchId },
    orderBy: { systemCode: 'desc' },
    select: { systemCode: true },
  });

  let nextSeq = 1;
  if (last?.systemCode) {
    // Extract the numeric part: ISSA-BR01-000042 → 42
    const parts = last.systemCode.split('-');
    const seq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) {
      nextSeq = seq + 1;
    }
  }

  const paddedSeq = String(nextSeq).padStart(6, '0');
  return `ISSA-${branchCode.toUpperCase()}-${paddedSeq}`;
}

// ─── Create Trainee ───────────────────────────────────────────

/**
 * Register a new trainee. Creates:
 *   1. User record (role=TRAINEE, auto-generated portal password)
 *   2. TraineeProfile with auto-generated system code
 *   3. Platform phone index entry
 *
 * Returns the trainee + portal password (shown ONCE to admin).
 */
export async function createTrainee(
  tenantId: string,
  branchId: string,
  input: CreateTraineeInput,
  executorId: string
) {
  // The account holder (guardian). For an adult registering themselves the
  // account name is their own name; otherwise a parent/guardian name is required.
  const guardianName = input.isSelfAccount ? input.name : (input.guardianName?.trim() || '');
  if (!guardianName) {
    throw new BadRequestError(
      'Guardian name is required (or mark the trainee as an adult registering themselves)'
    );
  }

  // Find an existing account by phone in this branch — link to it (a parent's
  // second child) instead of rejecting; otherwise a new account is created.
  const existingUser = await withTenantContext(tenantId, async (tx) => {
    return tx.user.findFirst({
      where: { branchId, phoneNumber: input.phoneNumber },
      select: { id: true, role: true, name: true, phoneNumber: true },
    });
  });

  // A phone already used by staff (captain/moderator/admin) can't back a trainee.
  if (existingUser && existingUser.role !== UserRole.TRAINEE) {
    throw new ConflictError(
      `Phone number ${input.phoneNumber} belongs to a non-trainee account and cannot be reused for a trainee.`
    );
  }

  const branch = await withTenantContext(tenantId, async (tx) => {
    return tx.branch.findUnique({ where: { id: branchId }, select: { code: true } });
  });
  if (!branch) {
    throw new BadRequestError('Branch not found');
  }

  // A brand-new account gets a one-time portal password (last 6 digits of phone);
  // linking to an existing account reuses that account's existing login.
  const isNewAccount = !existingUser;
  const portalPassword = isNewAccount ? passwordFromPhone(input.phoneNumber) : null;
  const passwordHash = portalPassword ? await hashPassword(portalPassword) : null;

  const { account, trainee } = await withTenantContext(tenantId, async (tx) => {
    // 1. Find-or-create the ACCOUNT (guardian, or the adult themselves)
    const account = existingUser
      ? existingUser
      : await tx.user.create({
          data: {
            branchId,
            name: guardianName,
            phoneNumber: input.phoneNumber,
            passwordHash: passwordHash!,
            role: UserRole.TRAINEE,
            language: 'ar', // default for Egyptian swimming academies
            isActive: true,
          },
          select: { id: true, role: true, name: true, phoneNumber: true },
        });

    // 2. Generate system code INSIDE this transaction
    const systemCode = await generateSystemCode(tx, branchId, branch.code);

    // 3. Create the TraineeProfile (the athlete) under the account
    const newTrainee = await tx.traineeProfile.create({
      data: {
        userId: account.id,
        branchId,
        name: input.name,
        systemCode,
        dateOfBirth: new Date(input.dateOfBirth),
        whatsappNumber: input.whatsappNumber,
        parentIdCard: input.parentIdCard,
        medicalCondition: input.medicalCondition,
        referralType: input.referralType,
        // Skills
        pastExperience: input.pastExperience ?? null,
        otherAcademies: input.otherAcademies ?? null,
        levelId: input.levelId ?? null,
        // Optional personal
        maritalStatus: input.maritalStatus ?? null,
        fatherJob: input.fatherJob ?? null,
        fatherQualifications: input.fatherQualifications ?? null,
        motherJob: input.motherJob ?? null,
        motherQualifications: input.motherQualifications ?? null,
        birthOrder: input.birthOrder ?? null,
        // Psychological
        personalityTraits: input.personalityTraits ?? null,
        // Physical
        height: input.height ?? null,
        weight: input.weight ?? null,
        armLength: input.armLength ?? null,
        footLength: input.footLength ?? null,
        chestCircumference: input.chestCircumference ?? null,
        waistCircumference: input.waistCircumference ?? null,
      },
    });

    // 4. Audit log
    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.CREATE,
      entityType: 'trainee',
      entityId: newTrainee.id,
      newValues: {
        systemCode,
        traineeName: input.name,
        account: account.name,
        phoneNumber: account.phoneNumber,
        linkedToExistingAccount: !isNewAccount,
      },
    });

    return { account, trainee: newTrainee };
  });

  // Sync platform phone index only when a NEW account was created.
  if (isNewAccount) {
    await platformPrisma.userPhoneIndex.upsert({
      where: {
        phoneNumber_tenantId: { phoneNumber: input.phoneNumber, tenantId },
      },
      create: {
        phoneNumber: input.phoneNumber,
        tenantId,
        userId: account.id,
        branchId,
        role: UserRole.TRAINEE,
      },
      update: { userId: account.id, branchId, role: UserRole.TRAINEE },
    });
  }

  // portalPassword is returned ONCE for a new account; null when linking.
  return {
    trainee: { ...trainee, user: { name: account.name, phoneNumber: account.phoneNumber } },
    portalPassword,
  };
}

// ─── List Trainees ────────────────────────────────────────────

/**
 * List trainees for a branch with pagination and optional search/filter.
 */
export async function listTrainees(
  tenantId: string,
  branchId: string,
  query: ListTraineesQuery
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
        OR: [
          { systemCode: { startsWith: search.toUpperCase() } },
          { user: { name: { contains: search, mode: 'insensitive' as const } } },
          { user: { phoneNumber: { contains: search } } },
        ],
      }),
    };

    const [trainees, total] = await Promise.all([
      tx.traineeProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { name: true, phoneNumber: true, isActive: true, language: true },
          },
          subscriptions: {
            where: { status: 'ACTIVE' },
            take: 1,
            include: {
              plan: { select: { name: true } },
              level: { select: { name: true } },
            },
          },
          groupTrainees: {
            orderBy: { joinedAt: 'desc' },
            take: 1,
            select: { group: { select: { name: true } } },
          },
        },
      }),
      tx.traineeProfile.count({ where }),
    ]);

    return { trainees, total };
  });
}

// ─── Search Trainees ──────────────────────────────────────────

/**
 * Fast search by system code prefix, name (fuzzy), or phone substring.
 * Used by the search bar with debounce on the trainees list page.
 */
export async function searchTrainees(
  tenantId: string,
  branchId: string,
  query: SearchTraineeQuery
) {
  return withTenantContext(tenantId, async (tx) => {
    const { q, page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      branchId,
      OR: [
        { systemCode: { contains: q.toUpperCase() } },
        { user: { name: { contains: q, mode: 'insensitive' as const } } },
        { user: { phoneNumber: { contains: q } } },
      ],
    };

    const [trainees, total] = await Promise.all([
      tx.traineeProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { systemCode: 'asc' },
        include: {
          user: {
            select: { name: true, phoneNumber: true, isActive: true },
          },
          subscriptions: {
            where: { status: 'ACTIVE' },
            take: 1,
            include: { plan: { select: { name: true } } },
          },
        },
      }),
      tx.traineeProfile.count({ where }),
    ]);

    return { trainees, total };
  });
}

// ─── Get Trainee By ID ────────────────────────────────────────

/**
 * Retrieve a single trainee with full profile, enforcing branch isolation.
 */
export async function getTraineeById(
  tenantId: string,
  branchId: string,
  traineeId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const trainee = await tx.traineeProfile.findFirst({
      where: { id: traineeId, branchId },
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
        level: { select: { id: true, name: true } },
        subscriptions: {
          where: { status: 'ACTIVE' },
          take: 1,
          include: {
            plan: { select: { id: true, name: true, minSessions: true, freezeSessions: true } },
            level: { select: { id: true, name: true } },
          },
        },
        groupTrainees: {
          orderBy: { joinedAt: 'desc' },
          select: { group: { select: { id: true, name: true } } },
        },
      },
    });

    if (!trainee) {
      throw new NotFoundError('Trainee not found');
    }

    return trainee;
  });
}

// ─── Change Level / Group (within the current plan) ───────────

/**
 * Move an enrolled trainee to a different LEVEL and/or GROUP, constrained to
 * their ACTIVE subscription's plan. Admin/Moderator only.
 *   - Level must belong to the subscription's plan → updates the subscription
 *     level (and keeps TraineeProfile.level in sync).
 *   - Group must belong to the same plan and have spare capacity → the trainee
 *     is moved (existing GroupTrainee row(s) replaced with the new one).
 * All in one atomic tx. No-ops for a field already set to the requested value.
 */
export async function updateTraineeAssignment(
  tenantId: string,
  branchId: string,
  traineeId: string,
  input: UpdateAssignmentInput,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    // The active subscription is the anchor — its plan constrains both fields.
    const sub = await tx.traineeSubscription.findFirst({
      where: { traineeId, status: 'ACTIVE', trainee: { branchId } },
      select: { id: true, planId: true, levelId: true },
    });
    if (!sub) {
      throw new BadRequestError(
        'Trainee has no active subscription — enroll them before changing level or group'
      );
    }

    const changes: Record<string, unknown> = {};

    // ── Level ────────────────────────────────────────────────
    if (input.levelId && input.levelId !== sub.levelId) {
      const level = await tx.subscriptionPlanLevel.findFirst({
        where: { id: input.levelId, planId: sub.planId },
        select: { id: true },
      });
      if (!level) {
        throw new BadRequestError('Selected level does not belong to the current plan');
      }
      await tx.traineeSubscription.update({
        where: { id: sub.id },
        data: { levelId: input.levelId },
      });
      // Keep the profile's level in sync so it matches the enrolled level.
      await tx.traineeProfile.update({
        where: { id: traineeId },
        data: { levelId: input.levelId },
      });
      changes.levelId = { from: sub.levelId, to: input.levelId };
    }

    // ── Group ────────────────────────────────────────────────
    if (input.groupId) {
      const current = await tx.groupTrainee.findFirst({
        where: { traineeId },
        orderBy: { joinedAt: 'desc' },
        select: { groupId: true },
      });
      if (!current || current.groupId !== input.groupId) {
        const group = await tx.group.findFirst({
          where: { id: input.groupId, branchId, isActive: true },
          include: { _count: { select: { trainees: true } } },
        });
        if (!group) throw new NotFoundError('Group not found or inactive');
        if (group.planId !== sub.planId) {
          throw new BadRequestError('Group belongs to a different subscription plan');
        }
        if (group._count.trainees >= group.maxTrainees) {
          throw new ConflictError(`Group is at maximum capacity (${group.maxTrainees} trainees)`);
        }
        // Move: drop existing membership(s), assign to the new group.
        await tx.groupTrainee.deleteMany({ where: { traineeId } });
        await tx.groupTrainee.create({ data: { groupId: input.groupId, traineeId } });
        changes.groupId = { from: current?.groupId ?? null, to: input.groupId };
      }
    }

    if (Object.keys(changes).length > 0) {
      await writeAuditLog(tx, {
        userId: executorId,
        branchId,
        action: AuditAction.UPDATE,
        entityType: 'TraineeProfile',
        entityId: traineeId,
        newValues: { assignment: changes },
      });
    }

    return { updated: true, changes };
  });
}

// ─── Update Trainee ───────────────────────────────────────────

/**
 * Update trainee profile fields. Also updates User.name if provided.
 */
export async function updateTrainee(
  tenantId: string,
  branchId: string,
  traineeId: string,
  input: UpdateTraineeInput,
  executorId: string
) {
  // Check phone conflict if changing phone
  if (input.phoneNumber) {
    const conflict = await withTenantContext(tenantId, async (tx) => {
      const trainee = await tx.traineeProfile.findFirst({
        where: { id: traineeId, branchId },
        include: { user: { select: { id: true } } },
      });
      if (!trainee) return null;

      return tx.user.findFirst({
        where: {
          branchId,
          phoneNumber: input.phoneNumber,
          NOT: { id: trainee.userId },
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

  return withTenantContext(tenantId, async (tx) => {
    const existing = await tx.traineeProfile.findFirst({
      where: { id: traineeId, branchId },
      include: { user: { select: { id: true, name: true, phoneNumber: true } } },
    });

    if (!existing) throw new NotFoundError('Trainee not found');

    // The account (User) now holds only the shared login phone; the athlete's
    // own name lives on TraineeProfile.name (updated below). Note: changing the
    // phone changes the login for the whole account (all siblings).
    const userUpdates: Record<string, unknown> = {};
    if (input.phoneNumber !== undefined) userUpdates.phoneNumber = input.phoneNumber;

    if (Object.keys(userUpdates).length > 0) {
      await tx.user.update({
        where: { id: existing.userId },
        data: userUpdates,
      });
    }

    // Update TraineeProfile fields (exclude user fields)
    const { name, phoneNumber, ...profileInput } = input;

    const updated = await tx.traineeProfile.update({
      where: { id: traineeId },
      data: {
        ...(name !== undefined && { name }),
        ...(profileInput.dateOfBirth !== undefined && {
          dateOfBirth: new Date(profileInput.dateOfBirth!),
        }),
        ...(profileInput.whatsappNumber !== undefined && {
          whatsappNumber: profileInput.whatsappNumber,
        }),
        ...(profileInput.parentIdCard !== undefined && {
          parentIdCard: profileInput.parentIdCard,
        }),
        ...(profileInput.medicalCondition !== undefined && {
          medicalCondition: profileInput.medicalCondition,
        }),
        ...(profileInput.pastExperience !== undefined && {
          pastExperience: profileInput.pastExperience,
        }),
        ...(profileInput.otherAcademies !== undefined && {
          otherAcademies: profileInput.otherAcademies,
        }),
        ...(profileInput.levelId !== undefined && {
          levelId: profileInput.levelId,
        }),
        ...(profileInput.maritalStatus !== undefined && {
          maritalStatus: profileInput.maritalStatus,
        }),
        ...(profileInput.fatherJob !== undefined && {
          fatherJob: profileInput.fatherJob,
        }),
        ...(profileInput.fatherQualifications !== undefined && {
          fatherQualifications: profileInput.fatherQualifications,
        }),
        ...(profileInput.motherJob !== undefined && {
          motherJob: profileInput.motherJob,
        }),
        ...(profileInput.motherQualifications !== undefined && {
          motherQualifications: profileInput.motherQualifications,
        }),
        ...(profileInput.birthOrder !== undefined && {
          birthOrder: profileInput.birthOrder,
        }),
        ...(profileInput.personalityTraits !== undefined && {
          personalityTraits: profileInput.personalityTraits,
        }),
        ...(profileInput.height !== undefined && { height: profileInput.height }),
        ...(profileInput.weight !== undefined && { weight: profileInput.weight }),
        ...(profileInput.armLength !== undefined && { armLength: profileInput.armLength }),
        ...(profileInput.footLength !== undefined && { footLength: profileInput.footLength }),
        ...(profileInput.chestCircumference !== undefined && {
          chestCircumference: profileInput.chestCircumference,
        }),
        ...(profileInput.waistCircumference !== undefined && {
          waistCircumference: profileInput.waistCircumference,
        }),
      },
      include: {
        user: { select: { name: true, phoneNumber: true } },
      },
    });

    const diff = buildAuditDiff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>
    );
    if (diff) {
      await writeAuditLog(tx, {
        branchId,
        userId: executorId,
        action: AuditAction.UPDATE,
        entityType: 'trainee',
        entityId: traineeId,
        oldValues: diff.old,
        newValues: diff.new,
      });
    }

    return updated;
  });
}

// ─── Deactivate Trainee ───────────────────────────────────────

/**
 * Deactivate a trainee (soft delete). Removes from platform phone index.
 */
export async function deactivateTrainee(
  tenantId: string,
  branchId: string,
  traineeId: string,
  executorId: string
) {
  const { userId, phoneNumber } = await withTenantContext(tenantId, async (tx) => {
    const trainee = await tx.traineeProfile.findFirst({
      where: { id: traineeId, branchId },
      include: { user: { select: { id: true, phoneNumber: true } } },
    });

    if (!trainee) throw new NotFoundError('Trainee not found');

    await tx.user.update({
      where: { id: trainee.userId },
      data: { isActive: false },
    });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'trainee',
      entityId: traineeId,
      newValues: { isActive: false },
    });

    return { userId: trainee.userId, phoneNumber: trainee.user.phoneNumber };
  });

  // Remove from platform phone index
  await platformPrisma.userPhoneIndex.deleteMany({
    where: { userId, tenantId },
  });

  return { success: true };
}
