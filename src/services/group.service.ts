/**
 * Group Service
 *
 * Handles group CRUD, capacity validation, and trainee listing.
 * Every query includes branchId for strict branch isolation.
 */

import { subYears } from 'date-fns';
import { withTenantContext, type TransactionClient } from '@/lib/db/tenant-client';
import { writeAuditLog } from './audit.service';
import { getSubscriptionState } from '@/lib/utils/subscription';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/api/error-handler';
import { AuditAction } from '@/types';
import type {
  CreateGroupInput,
  UpdateGroupInput,
  ListGroupsQuery,
} from '@/schemas/group.schema';

// ─── Group placement ──────────────────────────────────────────

/**
 * Make `group` the trainee's group, inside the caller's transaction. Shared by
 * enrollment, renewal and changing a trainee's group, so they cannot drift
 * apart again (hardening plan §27). Enrollment used to `create` the membership
 * and renewal to `upsert` it, and both counted the trainee against their own
 * group's capacity.
 *
 *   - Capacity counts the OTHER members. A member renewing into their own full
 *     group already holds one of its seats; they were refused with "Group is at
 *     maximum capacity".
 *   - The membership is upserted. Memberships outlive subscriptions (the
 *     attendance sheet uses them for the post-expiry retake window), so a
 *     returning trainee is usually still a member, and `create` failed on the
 *     (group_id, trainee_id) unique constraint: an expired trainee could not
 *     re-enroll into the group they had been in.
 *   - The trainee leaves any other group. One active subscription means one
 *     group, exactly as changing a trainee's group already moved them; staying
 *     behind in the old group took a seat and a line on its attendance sheet.
 *   - The group row is locked first, so two placements into the last seat
 *     cannot both pass the count. A transaction does not lock rows it only
 *     reads (see subscription.service.ts).
 */
export async function placeTraineeInGroup(
  tx: TransactionClient,
  group: { id: string; maxTrainees: number },
  traineeId: string
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "groups" WHERE "id" = ${group.id}::uuid FOR UPDATE`;

  const otherMembers = await tx.groupTrainee.count({
    where: { groupId: group.id, NOT: { traineeId } },
  });
  if (otherMembers >= group.maxTrainees) {
    throw new ConflictError(`Group is at maximum capacity (${group.maxTrainees} trainees)`);
  }

  await tx.groupTrainee.deleteMany({ where: { traineeId, NOT: { groupId: group.id } } });
  await tx.groupTrainee.upsert({
    where: { groupId_traineeId: { groupId: group.id, traineeId } },
    create: { groupId: group.id, traineeId },
    update: {},
  });
}

// ─── Lapsed members ───────────────────────────────────────────

/** The nil UUID: audit entries written by a background job, not by a person. */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Release the group seats of trainees whose subscription is over and whose
 * retake window has passed, inside the caller's transaction. Run daily by the
 * subscription-expiry job (hardening plan §42).
 *
 * Memberships outlive subscriptions on purpose: for `plan.freezeRetakeDays`
 * after a subscription ends, the trainee stays on the attendance sheet for
 * makeups. Nothing ever removed them after that, so someone who left months ago
 * still held a seat: groups filled with people who had gone, and new
 * enrollments were refused as "at maximum capacity".
 *
 *   - "Past the window" is getSubscriptionState's pastGrace, the same rule that
 *     takes the trainee off the attendance sheet, so a seat is released exactly
 *     when they stop appearing there.
 *   - Only a trainee whose LATEST subscription the system has EXPIRED is
 *     touched. One with no subscription at all is left alone: there is nothing
 *     to judge by.
 *   - The DELETE re-checks for an ACTIVE subscription, so a trainee who renews
 *     while this runs keeps their seat.
 *   - Each release is audited, so staff can see why someone left a group. Their
 *     attendance history stays on the sheets of the sessions they attended
 *     (getAttendanceSheet includes former members with a record).
 *
 * Returns how many seats were released.
 */
export async function releaseLapsedSeats(
  tx: TransactionClient,
  now: Date = new Date()
): Promise<number> {
  const candidates = await tx.groupTrainee.findMany({
    where: { trainee: { subscriptions: { none: { status: 'ACTIVE' } } } },
    select: {
      id: true,
      trainee: {
        select: {
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              status: true,
              endDate: true,
              attendedSessions: true,
              totalSessions: true,
              expiredAt: true,
              plan: { select: { freezeRetakeDays: true } },
            },
          },
        },
      },
    },
  });

  const lapsedIds = candidates
    .filter(({ trainee }) => {
      const latest = trainee.subscriptions[0];
      if (!latest || latest.status !== 'EXPIRED') return false;
      return getSubscriptionState(
        {
          status: latest.status,
          endDate: latest.endDate,
          attendedSessions: latest.attendedSessions,
          totalSessions: latest.totalSessions,
          expiredAt: latest.expiredAt,
          freezeRetakeDays: latest.plan.freezeRetakeDays,
        },
        now
      ).pastGrace;
    })
    .map((m) => m.id);
  if (lapsedIds.length === 0) return 0;

  const released = await tx.$queryRaw<
    { group_id: string; trainee_id: string; branch_id: string }[]
  >`
    DELETE FROM group_trainees gt
    USING groups g
    WHERE gt.id = ANY(${lapsedIds}::uuid[])
      AND g.id = gt.group_id
      AND NOT EXISTS (
        SELECT 1 FROM trainee_subscriptions s
        WHERE s.trainee_id = gt.trainee_id AND s.status = 'ACTIVE'
      )
    RETURNING gt.group_id::text AS group_id, gt.trainee_id::text AS trainee_id,
              g.branch_id::text AS branch_id
  `;

  for (const seat of released) {
    await writeAuditLog(tx, {
      branchId: seat.branch_id,
      userId: SYSTEM_USER_ID,
      action: AuditAction.UPDATE,
      entityType: 'Group',
      entityId: seat.group_id,
      newValues: { removedTrainee: seat.trainee_id, reason: 'retake window ended' },
    });
  }
  return released.length;
}

// ─── Create Group ─────────────────────────────────────────────

export async function createGroup(
  tenantId: string,
  branchId: string,
  executorId: string,
  input: CreateGroupInput
) {
  return withTenantContext(tenantId, async (tx) => {
    // Validate captain belongs to branch
    const captain = await tx.captainProfile.findFirst({
      where: { id: input.captainId, branchId },
      select: { id: true },
    });
    if (!captain) throw new NotFoundError('Captain not found in this branch');

    // Validate plan belongs to branch and is active
    const plan = await tx.subscriptionPlan.findFirst({
      where: { id: input.planId, branchId, isActive: true },
      select: { id: true },
    });
    if (!plan) throw new NotFoundError('Subscription plan not found or inactive');

    const group = await tx.group.create({
      data: {
        branchId,
        captainId: input.captainId,
        planId: input.planId,
        name: input.name,
        minTrainees: input.minTrainees,
        maxTrainees: input.maxTrainees,
        daysPerWeek: input.scheduleDays.length,
        scheduleDays: input.scheduleDays,
        startTime: input.startTime,
        sessionDuration: input.sessionDuration,
      },
      include: {
        captain: {
          select: { user: { select: { name: true } } },
        },
        plan: { select: { name: true } },
        _count: { select: { trainees: true } },
      },
    });

    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.CREATE,
      entityType: 'Group',
      entityId: group.id,
      newValues: { name: group.name, planId: input.planId, captainId: input.captainId },
    });

    return group;
  });
}

// ─── List Groups ──────────────────────────────────────────────

export async function listGroups(
  tenantId: string,
  branchId: string,
  query: ListGroupsQuery
) {
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { branchId };
  if (query.planId) where.planId = query.planId;
  if (query.captainId) where.captainId = query.captainId;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  // Meets on a given day of the week.
  if (query.day) where.scheduleDays = { has: query.day };
  // Starts within a given clock hour (startTime is "HH:MM").
  if (query.hour !== undefined) {
    where.startTime = { startsWith: `${String(query.hour).padStart(2, '0')}:` };
  }
  // Has at least one trainee whose current age falls in [ageMin, ageMax].
  // age >= ageMin ⇔ born on/before (now − ageMin years);
  // age <= ageMax ⇔ born after (now − (ageMax+1) years).
  if (query.ageMin !== undefined || query.ageMax !== undefined) {
    const now = new Date();
    const dob: Record<string, Date> = {};
    if (query.ageMin !== undefined) dob.lte = subYears(now, query.ageMin);
    if (query.ageMax !== undefined) dob.gte = subYears(now, query.ageMax + 1);
    where.trainees = { some: { trainee: { dateOfBirth: dob } } };
  }

  return withTenantContext(tenantId, async (tx) => {
    const [groups, total] = await Promise.all([
      tx.group.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          captain: {
            select: { user: { select: { name: true } } },
          },
          plan: { select: { id: true, name: true, amount: true } },
          _count: { select: { trainees: true } },
        },
      }),
      tx.group.count({ where }),
    ]);

    return {
      groups,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });
}

// ─── Get Group By ID ──────────────────────────────────────────

export async function getGroupById(
  tenantId: string,
  branchId: string,
  groupId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const group = await tx.group.findFirst({
      where: { id: groupId, branchId },
      include: {
        captain: {
          select: {
            id: true,
            specialization: true,
            attendingDays: true,
            user: { select: { name: true, phoneNumber: true } },
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            amount: true,
            minSessions: true,
            periodType: true,
          },
        },
        trainees: {
          include: {
            trainee: {
              select: {
                id: true,
                name: true,
                systemCode: true,
                user: { select: { name: true, phoneNumber: true } },
                subscriptions: {
                  where: { status: 'ACTIVE' },
                  select: { status: true, endDate: true, attendedSessions: true, totalSessions: true },
                  take: 1,
                },
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        sessions: {
          where: { status: 'SCHEDULED', scheduledAt: { gte: new Date() } },
          orderBy: { scheduledAt: 'asc' },
          take: 5,
          select: { id: true, scheduledAt: true, status: true, durationMinutes: true },
        },
        _count: { select: { trainees: true, sessions: true } },
      },
    });

    if (!group) throw new NotFoundError('Group not found');
    return group;
  });
}

/**
 * Strip data a CAPTAIN must not see from a group-detail payload:
 *   - the subscription plan PRICE (plan.amount),
 *   - each trainee's PHONE number (trainee.user.phoneNumber),
 *   - each trainee's SYSTEM CODE (trainee.systemCode).
 *
 * Redacts server-side so the values never reach the client at all (a
 * frontend-only hide would still ship them in the network response).
 * Admin/Moderator callers keep the full object — only pass a captain's
 * payload through here.
 */
export function redactGroupDetailForCaptain(
  group: Awaited<ReturnType<typeof getGroupById>>
) {
  return {
    ...group,
    plan: {
      id: group.plan.id,
      name: group.plan.name,
      minSessions: group.plan.minSessions,
      periodType: group.plan.periodType,
    },
    trainees: group.trainees.map((gt) => ({
      ...gt,
      trainee: {
        id: gt.trainee.id,
        name: gt.trainee.name,
        user: { name: gt.trainee.user.name },
        subscriptions: gt.trainee.subscriptions,
      },
    })),
  };
}

// ─── Update Group ─────────────────────────────────────────────

export async function updateGroup(
  tenantId: string,
  branchId: string,
  groupId: string,
  input: UpdateGroupInput,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const existing = await tx.group.findFirst({
      where: { id: groupId, branchId },
      select: {
        id: true,
        name: true,
        scheduleDays: true,
        startTime: true,
        sessionDuration: true,
      },
    });
    if (!existing) throw new NotFoundError('Group not found');

    if (input.captainId) {
      const captain = await tx.captainProfile.findFirst({
        where: { id: input.captainId, branchId },
        select: { id: true },
      });
      if (!captain) throw new NotFoundError('Captain not found in this branch');
    }

    if (input.planId) {
      const plan = await tx.subscriptionPlan.findFirst({
        where: { id: input.planId, branchId, isActive: true },
        select: { id: true },
      });
      if (!plan) throw new NotFoundError('Plan not found or inactive');
    }

    // Did any schedule-shaping field actually change value? (Only these
    // affect generated session dates/times — name/captain/capacity do not.)
    const daysChanged =
      input.scheduleDays !== undefined &&
      [...input.scheduleDays].sort().join(',') !==
        [...existing.scheduleDays].sort().join(',');
    const timeChanged =
      input.startTime !== undefined && input.startTime !== existing.startTime;
    const durationChanged =
      input.sessionDuration !== undefined &&
      input.sessionDuration !== existing.sessionDuration;
    const scheduleChanged = daysChanged || timeChanged || durationChanged;

    const group = await tx.group.update({
      where: { id: groupId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.captainId !== undefined && { captainId: input.captainId }),
        ...(input.planId !== undefined && { planId: input.planId }),
        ...(input.minTrainees !== undefined && { minTrainees: input.minTrainees }),
        ...(input.maxTrainees !== undefined && { maxTrainees: input.maxTrainees }),
        ...(input.scheduleDays !== undefined && {
          scheduleDays: input.scheduleDays,
          daysPerWeek: input.scheduleDays.length,
        }),
        ...(input.startTime !== undefined && { startTime: input.startTime }),
        ...(input.sessionDuration !== undefined && { sessionDuration: input.sessionDuration }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
      include: {
        captain: { select: { user: { select: { name: true } } } },
        plan: { select: { name: true } },
        _count: { select: { trainees: true } },
      },
    });

    // When the schedule changes, drop the now-stale FUTURE sessions so they
    // can be regenerated from the new schedule.
    // ⚠️ SAFETY: only delete sessions that are (1) still SCHEDULED, (2) in the
    //    future, and (3) have NO attendance or evaluations. Past sessions,
    //    COMPLETED/CANCELLED sessions, and anything with recorded data are
    //    historical record and are never touched.
    if (scheduleChanged) {
      await tx.session.deleteMany({
        where: {
          groupId,
          branchId,
          status: 'SCHEDULED',
          scheduledAt: { gte: new Date() },
          attendanceRecords: { none: {} },
          evaluations: { none: {} },
        },
      });
    }

    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.UPDATE,
      entityType: 'Group',
      entityId: group.id,
      newValues: input,
    });

    return { group, scheduleChanged };
  });
}

// ─── Get Groups For Plan (enrollment picker) ──────────────────

/**
 * Returns active groups for a specific plan with available capacity.
 * Used by the trainee enrollment UI to show joinable groups.
 */
export async function getGroupsForPlan(
  tenantId: string,
  branchId: string,
  planId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const groups = await tx.group.findMany({
      where: { branchId, planId, isActive: true },
      include: {
        captain: { select: { user: { select: { name: true } } } },
        _count: { select: { trainees: true } },
      },
      orderBy: { name: 'asc' },
    });

    return groups.map((g) => ({
      ...g,
      availableSlots: g.maxTrainees - g._count.trainees,
      isFull: g._count.trainees >= g.maxTrainees,
    }));
  });
}

// ─── Remove Trainee From Group ────────────────────────────────

export async function removeTraineeFromGroup(
  tenantId: string,
  branchId: string,
  groupId: string,
  traineeId: string,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const group = await tx.group.findFirst({
      where: { id: groupId, branchId },
      select: { id: true },
    });
    if (!group) throw new NotFoundError('Group not found');

    const member = await tx.groupTrainee.findFirst({
      where: { groupId, traineeId },
    });
    if (!member) throw new NotFoundError('Trainee is not in this group');

    await tx.groupTrainee.delete({ where: { id: member.id } });

    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.UPDATE,
      entityType: 'Group',
      entityId: groupId,
      newValues: { removedTrainee: traineeId },
    });
  });
}
