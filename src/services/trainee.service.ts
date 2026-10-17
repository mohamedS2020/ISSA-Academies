/**
 * Trainee Management Service
 *
 * Handles registration, listing, search, edit, and deactivation of trainees.
 *
 * Key behaviors:
 *   - System code format: {BRANCHCODE}-{PADDED_SEQ}, from an atomic per-branch counter
 *   - On registration: find-or-create the account (User, role=TRAINEE) + the
 *     TraineeProfile in one tx. One account (a guardian) owns all its children.
 *   - Portal password returned ONCE — never stored in plain text
 *   - Every query includes { branchId } for strict branch isolation
 *   - Each trainee has its OWN active flag; the account stays active (and keeps
 *     its login) while any of its trainees is. A trainee's status used to be the
 *     account's, so deactivating one child deactivated every sibling and ended
 *     the parent's portal login.
 *   - The login follows every account change in the same transaction
 *     (syncLoginIndex, login-index.ts). Never write user_phone_index directly.
 */

import { withTenantContext, type TransactionClient } from '@/lib/db/tenant-client';
import { hashPassword, passwordFromPhone } from '@/lib/auth/password';
import { phoneSearchFragment } from '@/lib/phone';
import { writeAuditLog, buildAuditDiff } from './audit.service';
import {
  syncLoginIndex,
  assertPhoneAvailable,
  findActiveAccountByPhone,
  phoneInUseError,
  withPhoneGuard,
} from './login-index';
import { placeTraineeInGroup } from './group.service';
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
 * Take the next trainee system code for a branch.
 * Format: {BRANCHCODE}-{6-digit padded sequence}, e.g. BR01-000042.
 *
 * Increments `branches.trainee_seq` atomically; the UPDATE's row lock
 * serializes concurrent registrations. Must be called with the caller's tx so a
 * rolled-back registration rolls its number back too.
 *
 * This replaced three defects at once (hardening plan §25):
 *
 *   - A race. It read the branch's highest code and added one; concurrent
 *     registrations read the same code and all but one failed on the unique
 *     constraint. A transaction does not lock rows it only reads.
 *
 *   - A permanent lockout on branch rename. "Highest" was found by STRING sort
 *     and then parsed. Rename BR01 to one that sorts earlier, such as AAA, and
 *     the old `…-BR01-000042` still sorted last — so it kept producing 43, and
 *     every registration in that branch collided from then on. The counter never
 *     looks at existing codes, so a rename cannot affect it.
 *
 *   - A hardcoded platform name. Codes were prefixed with the first academy's name, in every academy.
 *     A code identifies a trainee within their own academy, where the branch
 *     code is already unique, so no platform prefix is needed at all.
 */
async function generateSystemCode(
  tx: Parameters<Parameters<typeof withTenantContext>[1]>[0],
  branchId: string,
  branchCode: string
): Promise<string> {
  const [row] = await tx.$queryRaw<{ trainee_seq: number }[]>`
    UPDATE "branches"
    SET "trainee_seq" = "trainee_seq" + 1
    WHERE "id" = ${branchId}::uuid
    RETURNING "trainee_seq"
  `;
  if (!row) throw new BadRequestError('Branch not found');

  return `${branchCode.toUpperCase()}-${String(row.trainee_seq).padStart(6, '0')}`;
}

// ─── Guardian account ─────────────────────────────────────────

const ACCOUNT_SELECT = { id: true, role: true, name: true, phoneNumber: true } as const;

type GuardianAccount =
  | { kind: 'link'; account: { id: string; role: string; name: string; phoneNumber: string } }
  | { kind: 'reactivate'; account: { id: string; role: string; name: string; phoneNumber: string } }
  | { kind: 'create' };

/**
 * Which account a new trainee with this phone belongs to.
 *
 *   - link:       the active guardian account in this branch (a second child);
 *   - reactivate: this branch's deactivated guardian account with this phone
 *                 (a returning family keeps its account, history and login);
 *   - create:     nobody uses the number, so a new account.
 *
 * Throws when the number already signs in to another account: a staff account,
 * or a guardian account in another branch. A phone is one login per academy,
 * and the portal shows one branch per account, so one account cannot hold
 * trainees in two branches.
 */
async function resolveGuardianAccount(
  tx: TransactionClient,
  branchId: string,
  phoneNumber: string
): Promise<GuardianAccount> {
  const active = await findActiveAccountByPhone(tx, phoneNumber);
  if (active) {
    if (active.role !== UserRole.TRAINEE) {
      if (active.branchId !== branchId) throw phoneInUseError(active, branchId);
      throw new ConflictError(
        `Phone number ${phoneNumber} belongs to a staff account and cannot be reused for a trainee.`
      );
    }
    if (active.branchId !== branchId) {
      throw new ConflictError(
        'This phone number is the parent account of a trainee in another branch. One account ' +
          'cannot hold trainees in two branches; register this trainee with another number.'
      );
    }
    return { kind: 'link', account: active };
  }

  const dormant = await tx.user.findFirst({
    where: { branchId, phoneNumber, role: UserRole.TRAINEE, isActive: false },
    orderBy: { updatedAt: 'desc' },
    select: ACCOUNT_SELECT,
  });
  if (dormant) return { kind: 'reactivate', account: dormant };

  return { kind: 'create' };
}

// ─── Create Trainee ───────────────────────────────────────────

/**
 * Register a new trainee. In ONE transaction:
 *   1. find or create the account (User, role=TRAINEE): an existing guardian
 *      account in this branch is linked, a deactivated one is reactivated;
 *   2. the TraineeProfile with its auto-generated system code;
 *   3. the account's login.
 *
 * Returns the trainee + portal password (shown ONCE to admin), or null for the
 * password when the trainee joined an existing account, which keeps its login.
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

  // Look first, outside the transaction, only to know whether a password hash
  // is needed: bcrypt is slow, and a transaction should not hold its connection
  // while it runs. The transaction below decides for real.
  const preview = await withTenantContext(tenantId, (tx) =>
    resolveGuardianAccount(tx, branchId, input.phoneNumber)
  );
  // A brand-new account gets a one-time portal password (last 6 digits of phone).
  const portalPassword = preview.kind === 'create' ? passwordFromPhone(input.phoneNumber) : null;
  const passwordHash = portalPassword ? await hashPassword(portalPassword) : null;

  const { account, trainee, created } = await withPhoneGuard(() =>
    withTenantContext(tenantId, async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { code: true },
      });
      if (!branch) throw new BadRequestError('Branch not found');

      // 1. Find-or-create the ACCOUNT (guardian, or the adult themselves)
      const resolved = await resolveGuardianAccount(tx, branchId, input.phoneNumber);
      let account;
      if (resolved.kind === 'link') {
        account = resolved.account;
      } else if (resolved.kind === 'reactivate') {
        account = await tx.user.update({
          where: { id: resolved.account.id },
          data: { isActive: true },
          select: ACCOUNT_SELECT,
        });
      } else {
        // The number was in use a moment ago and is free now (its account was
        // deactivated in between). Rare; asking again is simpler than guessing.
        if (!passwordHash) {
          throw new ConflictError(
            'This phone number changed while the trainee was being saved. Please try again.'
          );
        }
        account = await tx.user.create({
          data: {
            branchId,
            name: guardianName,
            phoneNumber: input.phoneNumber,
            passwordHash,
            role: UserRole.TRAINEE,
            language: 'ar', // default for Egyptian academies
            isActive: true,
          },
          select: ACCOUNT_SELECT,
        });
      }

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
          linkedToExistingAccount: resolved.kind !== 'create',
          reactivatedAccount: resolved.kind === 'reactivate',
        },
      });

      // 5. The account's login, in the same transaction: a new account can sign
      // in the moment it exists, and a failure rolls the whole registration back
      // rather than leaving an account that can never sign in.
      await syncLoginIndex(tx, tenantId, account.id);

      return { account, trainee: newTrainee, created: resolved.kind === 'create' };
    })
  );

  // portalPassword is returned ONCE for a new account; null when the trainee
  // joined an existing account, which keeps its own password.
  return {
    trainee: { ...trainee, user: { name: account.name, phoneNumber: account.phoneNumber } },
    portalPassword: created ? portalPassword : null,
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
    const phoneFragment = search ? phoneSearchFragment(search) : null;

    const where = {
      branchId,
      // The trainee's own status, not the account's: siblings share an account.
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { systemCode: { startsWith: search.toUpperCase() } },
          { name: { contains: search, mode: 'insensitive' as const } },
          { user: { name: { contains: search, mode: 'insensitive' as const } } },
          // Stored numbers are canonical (+201...): match what was typed in any spelling.
          ...(phoneFragment ? [{ user: { phoneNumber: { contains: phoneFragment } } }] : []),
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
    const phoneFragment = phoneSearchFragment(q);

    const where = {
      branchId,
      OR: [
        { systemCode: { contains: q.toUpperCase() } },
        { name: { contains: q, mode: 'insensitive' as const } },
        { user: { name: { contains: q, mode: 'insensitive' as const } } },
        ...(phoneFragment ? [{ user: { phoneNumber: { contains: phoneFragment } } }] : []),
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
          select: { id: true, planId: true, maxTrainees: true },
        });
        if (!group) throw new NotFoundError('Group not found or inactive');
        if (group.planId !== sub.planId) {
          throw new BadRequestError('Group belongs to a different subscription plan');
        }
        // Move: the same placement enrollment and renewal use.
        await placeTraineeInGroup(tx, group, traineeId);
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
 * Update trainee profile fields. A phone change moves the whole account's login
 * (every sibling's) to the new number, in the same transaction; the old number
 * stops signing in.
 */
export async function updateTrainee(
  tenantId: string,
  branchId: string,
  traineeId: string,
  input: UpdateTraineeInput,
  executorId: string
) {
  return withPhoneGuard(() => withTenantContext(tenantId, async (tx) => {
    const existing = await tx.traineeProfile.findFirst({
      where: { id: traineeId, branchId },
      include: {
        user: { select: { id: true, name: true, phoneNumber: true, isActive: true } },
      },
    });

    if (!existing) throw new NotFoundError('Trainee not found');

    const phoneChanges =
      input.phoneNumber !== undefined && input.phoneNumber !== existing.user.phoneNumber;
    if (phoneChanges && existing.user.isActive) {
      await assertPhoneAvailable(tx, input.phoneNumber!, branchId, existing.userId);
    }

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

    // The login index used to keep the old number, so after a phone change the
    // parent could only sign in with the number they no longer use.
    if (phoneChanges) await syncLoginIndex(tx, tenantId, existing.userId);

    return updated;
  }));
}

// ─── Deactivate / Activate Trainee ────────────────────────────

/**
 * Deactivate one trainee. Its account (the guardian) is deactivated, and its
 * login removed, only when none of the account's other trainees is still
 * active: a parent keeps signing in for the children who still train.
 */
export async function deactivateTrainee(
  tenantId: string,
  branchId: string,
  traineeId: string,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const trainee = await tx.traineeProfile.findFirst({
      where: { id: traineeId, branchId },
      select: { id: true, userId: true },
    });

    if (!trainee) throw new NotFoundError('Trainee not found');

    await tx.traineeProfile.update({
      where: { id: trainee.id },
      data: { isActive: false },
    });

    const siblingsStillActive = await tx.traineeProfile.count({
      where: { userId: trainee.userId, isActive: true },
    });
    const accountDeactivated = siblingsStillActive === 0;
    if (accountDeactivated) {
      await tx.user.update({
        where: { id: trainee.userId },
        data: { isActive: false },
      });
    }

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'trainee',
      entityId: traineeId,
      newValues: { isActive: false, accountDeactivated },
    });

    await syncLoginIndex(tx, tenantId, trainee.userId);

    return { success: true, accountDeactivated };
  });
}

/**
 * Reactivate a trainee, and its account with it if the account was inactive.
 * Refused if the account's phone number now signs in to someone else.
 */
export async function activateTrainee(
  tenantId: string,
  branchId: string,
  traineeId: string,
  executorId: string
) {
  return withPhoneGuard(() => withTenantContext(tenantId, async (tx) => {
    const trainee = await tx.traineeProfile.findFirst({
      where: { id: traineeId, branchId },
      select: {
        id: true,
        userId: true,
        user: { select: { isActive: true, phoneNumber: true } },
      },
    });

    if (!trainee) throw new NotFoundError('Trainee not found');

    const accountReactivated = !trainee.user.isActive;
    if (accountReactivated) {
      await assertPhoneAvailable(tx, trainee.user.phoneNumber, branchId, trainee.userId);
      await tx.user.update({
        where: { id: trainee.userId },
        data: { isActive: true },
      });
    }

    await tx.traineeProfile.update({
      where: { id: trainee.id },
      data: { isActive: true },
    });

    await writeAuditLog(tx, {
      branchId,
      userId: executorId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'trainee',
      entityId: traineeId,
      newValues: { isActive: true, accountReactivated },
    });

    await syncLoginIndex(tx, tenantId, trainee.userId);

    return { success: true, accountReactivated };
  }));
}
