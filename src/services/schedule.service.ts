/**
 * ISSA — Schedule Service
 *
 * Handles session auto-generation, listing, cancellation, and rescheduling.
 *
 * ⚠️ DST SAFETY: toUTC() is called once per session INSIDE the loop.
 *    Groups can span multiple months. DST transitions shift the UTC offset
 *    mid-series — converting once before the loop and adding fixed intervals
 *    produces wrong UTC timestamps after a DST boundary.
 *
 * ⚠️ CANCELLED SESSIONS: cancelSession() must NEVER touch attendedSessions
 *    or freezeUsed on TraineeSubscription. Those are only modified in
 *    attendance.service.ts. (FR-SC-06)
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { writeAuditLog } from './audit.service';
import { getBranchTimezone } from './branch.service';
import { toUTC, toLocalDisplay } from '@/lib/utils/timezone';
import { NotFoundError, BadRequestError } from '@/lib/api/error-handler';
import { AuditAction } from '@/types';
import {
  addDays,
  eachDayOfInterval,
  format,
  parseISO,
  startOfDay,
} from 'date-fns';

// ─── DayOfWeek → JS getDay() index mapping ──────────────────
const DAY_OF_WEEK_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

// ─── Generate Sessions ───────────────────────────────────────

/**
 * Auto-generate Session records for a group between fromDate and toDate.
 * Idempotent — skips dates where a session already exists for the group.
 *
 * @param tenantId  - Tenant schema identifier
 * @param groupId   - The group to generate sessions for
 * @param fromDate  - Start date string (YYYY-MM-DD)
 * @param toDate    - End date string (YYYY-MM-DD)
 * @returns Number of sessions created
 */
export async function generateSessionsForGroup(
  tenantId: string,
  groupId: string,
  fromDate: string,
  toDate: string
): Promise<{ created: number }> {
  return withTenantContext(tenantId, async (tx) => {
    const group = await tx.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        branchId: true,
        scheduleDays: true,
        startTime: true,
        sessionDuration: true,
        isActive: true,
      },
    });

    if (!group) throw new NotFoundError('Group not found');
    if (!group.isActive) throw new BadRequestError('Cannot generate sessions for an inactive group');

    // Fetch branch timezone — never hardcode
    const timezone = await getBranchTimezone(tenantId, group.branchId);

    // Build set of allowed weekday indices
    const allowedDays = new Set(
      group.scheduleDays.map((d: string) => DAY_OF_WEEK_INDEX[d])
    );

    // Find all dates in the range that fall on the group's scheduled days
    const allDates = eachDayOfInterval({
      start: parseISO(fromDate),
      end: parseISO(toDate),
    }).filter((d) => allowedDays.has(d.getDay()));

    if (allDates.length === 0) return { created: 0 };

    // Find already-existing sessions for this group in the range to skip duplicates
    const existing = await tx.session.findMany({
      where: {
        groupId,
        branchId: group.branchId,
        scheduledAt: {
          gte: parseISO(fromDate),
          lte: addDays(parseISO(toDate), 1),
        },
      },
      select: { scheduledAt: true },
    });

    const existingDates = new Set(
      existing.map((s: { scheduledAt: Date }) => format(s.scheduledAt, 'yyyy-MM-dd'))
    );

    // ✅ DST-SAFE: toUTC() called once per session, inside the loop
    const sessionsToCreate = allDates
      .filter((d) => !existingDates.has(format(d, 'yyyy-MM-dd')))
      .map((date) => ({
        branchId: group.branchId,
        groupId: group.id,
        scheduledAt: toUTC(group.startTime, format(date, 'yyyy-MM-dd'), timezone),
        durationMinutes: group.sessionDuration,
      }));

    if (sessionsToCreate.length === 0) return { created: 0 };

    const result = await tx.session.createMany({ data: sessionsToCreate });

    return { created: result.count };
  });
}

// ─── List Sessions ───────────────────────────────────────────

export interface SessionFilters {
  branchId: string;
  groupId?: string;
  captainId?: string;
  traineeId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listSessions(tenantId: string, filters: SessionFilters) {
  const { branchId, groupId, captainId, traineeId, dateFrom, dateTo, status } = filters;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const skip = (page - 1) * limit;

  const timezone = await getBranchTimezone(tenantId, branchId);

  return withTenantContext(tenantId, async (tx) => {
    const where: Record<string, unknown> = { branchId };

    if (groupId) where.groupId = groupId;
    if (status) where.status = status;

    if (dateFrom || dateTo) {
      // dateFrom/dateTo are calendar days (YYYY-MM-DD) in the BRANCH's local
      // timezone. Filter by the branch-local day, not the UTC day: a session
      // at e.g. 00:30 Cairo is stored on the PREVIOUS UTC day (21:30Z), so
      // UTC-day bounds would wrongly drop it from its own local day (and a
      // same-day query would collapse to an empty window). Convert the local
      // day boundaries to UTC through the branch timezone.
      const range: { gte?: Date; lt?: Date } = {};
      if (dateFrom) {
        range.gte = toUTC('00:00', dateFrom.slice(0, 10), timezone);
      }
      if (dateTo) {
        // Exclusive upper bound = start of the day AFTER dateTo (local).
        const dayAfterTo = format(addDays(parseISO(dateTo.slice(0, 10)), 1), 'yyyy-MM-dd');
        range.lt = toUTC('00:00', dayAfterTo, timezone);
      }
      where.scheduledAt = range;
    }

    // If filtering by captain — resolve group IDs for that captain
    if (captainId) {
      const captainGroups = await tx.group.findMany({
        where: { branchId, captainId },
        select: { id: true },
      });
      where.groupId = { in: captainGroups.map((g: { id: string }) => g.id) };
    }

    // If filtering by trainee — resolve group IDs that contain the trainee
    if (traineeId) {
      const traineeGroups = await tx.groupTrainee.findMany({
        where: { traineeId },
        select: { groupId: true },
      });
      where.groupId = { in: traineeGroups.map((g: { groupId: string }) => g.groupId) };
    }

    const [sessions, total] = await Promise.all([
      tx.session.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        skip,
        take: limit,
        include: {
          group: {
            select: {
              id: true,
              name: true,
              captain: {
                select: { user: { select: { name: true } } },
              },
            },
          },
          _count: { select: { attendanceRecords: true } },
        },
      }),
      tx.session.count({ where }),
    ]);

    return {
      data: sessions.map((s: any) => ({
        ...s,
        scheduledAtLocal: toLocalDisplay(s.scheduledAt, timezone),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });
}

// ─── Get Session By ID ───────────────────────────────────────

export async function getSessionById(
  tenantId: string,
  branchId: string,
  sessionId: string
) {
  const timezone = await getBranchTimezone(tenantId, branchId);

  return withTenantContext(tenantId, async (tx) => {
    const session = await tx.session.findFirst({
      where: { id: sessionId, branchId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            captain: {
              select: {
                user: { select: { id: true, name: true } },
              },
            },
          },
        },
        attendanceRecords: {
          include: {
            trainee: { select: { id: true, name: true, systemCode: true, user: { select: { name: true } } } },
          },
        },
        evaluations: {
          include: {
            trainee: { select: { id: true, name: true, user: { select: { name: true } } } },
            evaluator: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!session) throw new NotFoundError('Session not found');

    return {
      ...session,
      scheduledAtLocal: toLocalDisplay(session.scheduledAt, timezone),
    };
  });
}

// ─── Cancel Session ──────────────────────────────────────────
//
// ⚠️ CRITICAL (FR-SC-06): This function must NEVER touch
//    attendedSessions or freezeUsed. Only set status = CANCELLED.

export async function cancelSession(
  tenantId: string,
  branchId: string,
  sessionId: string,
  reason: string,
  userId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const session = await tx.session.findFirst({
      where: { id: sessionId, branchId },
    });

    if (!session) throw new NotFoundError('Session not found');
    if (session.status === 'CANCELLED') {
      throw new BadRequestError('Session is already cancelled');
    }
    if (session.status === 'COMPLETED') {
      throw new BadRequestError('Cannot cancel a completed session');
    }

    const updated = await tx.session.update({
      where: { id: sessionId },
      data: {
        status: 'CANCELLED',
        cancelledReason: reason,
      },
    });

    await writeAuditLog(tx, {
      branchId,
      userId,
      action: AuditAction.UPDATE,
      entityType: 'session',
      entityId: sessionId,
      oldValues: { status: session.status },
      newValues: { status: 'CANCELLED', cancelledReason: reason },
    });

    return updated;
  });
}

// ─── Reschedule Session ──────────────────────────────────────

export async function rescheduleSession(
  tenantId: string,
  branchId: string,
  sessionId: string,
  newScheduledAt: Date,
  userId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const session = await tx.session.findFirst({
      where: { id: sessionId, branchId },
    });

    if (!session) throw new NotFoundError('Session not found');
    if (session.status === 'CANCELLED') {
      throw new BadRequestError('Cannot reschedule a cancelled session');
    }
    if (session.status === 'COMPLETED') {
      throw new BadRequestError('Cannot reschedule a completed session');
    }

    const updated = await tx.session.update({
      where: { id: sessionId },
      data: { scheduledAt: newScheduledAt },
    });

    await writeAuditLog(tx, {
      branchId,
      userId,
      action: AuditAction.UPDATE,
      entityType: 'session',
      entityId: sessionId,
      oldValues: { scheduledAt: session.scheduledAt },
      newValues: { scheduledAt: newScheduledAt },
    });

    return updated;
  });
}

// ─── Generate Rolling 4-Week Window ─────────────────────────
// Called by the weekly cron job to extend sessions forward

export async function generateRollingSessionsForAllGroups(tenantId: string): Promise<void> {
  await withTenantContext(tenantId, async (tx) => {
    const groups = await tx.group.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const group of groups) {
      const fromDate = format(new Date(), 'yyyy-MM-dd');
      const toDate = format(addDays(new Date(), 28), 'yyyy-MM-dd');
      // generateSessionsForGroup opens its own withTenantContext — call outside tx
      await generateSessionsForGroup(tenantId, group.id, fromDate, toDate);
    }
  });
}
