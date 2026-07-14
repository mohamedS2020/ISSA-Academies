/**
 * ISSA — Dashboard Service
 *
 * Real-data aggregations for the staff dashboard (Admin/Moderator + Captain
 * views). Replaces the hardcoded mock arrays that previously lived directly
 * in dashboard/page.tsx.
 *
 * Heavily composes existing functions — finance.service.ts (task 8) and
 * schedule.service.ts (task 7) — rather than duplicating aggregation logic.
 * Only the "expiring soon" list, the 7-day activity trend, and the two
 * Captain count queries are genuinely new.
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { listSessions } from './schedule.service';
import { getIncomeSummary, getOutstandingBalance } from './finance.service';
import { NotFoundError } from '@/lib/api/error-handler';
import { startOfMonth, startOfDay, endOfDay, subDays, format } from 'date-fns';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Maps the authenticated user's JWT `userId` to their own `CaptainProfile.id`
 * — same `userId → profile` resolution shape as portal.service.ts's
 * resolveOwnTraineeId.
 */
export async function resolveOwnCaptainId(
  tenantId: string,
  branchId: string,
  userId: string
): Promise<string> {
  return withTenantContext(tenantId, async (tx) => {
    const captain = await tx.captainProfile.findFirst({
      where: { userId, branchId },
      select: { id: true },
    });
    if (!captain) throw new NotFoundError('Captain profile not found');
    return captain.id;
  });
}

// ─── Admin / Moderator Dashboard ────────────────────────────

export async function getAdminDashboard(tenantId: string, branchId: string) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const today = todayDateString();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const countsAndExpiring = withTenantContext(tenantId, async (tx) => {
    const [
      totalTrainees,
      newTraineesThisMonth,
      activeSubscriptions,
      newSubscriptionsThisMonth,
      expiringSoon,
    ] = await Promise.all([
      tx.traineeProfile.count({ where: { branchId } }),
      tx.traineeProfile.count({ where: { branchId, createdAt: { gte: monthStart } } }),
      tx.traineeSubscription.count({ where: { status: 'ACTIVE', trainee: { branchId } } }),
      tx.traineeSubscription.count({
        where: { trainee: { branchId }, createdAt: { gte: monthStart } },
      }),
      tx.traineeSubscription.findMany({
        where: {
          status: 'ACTIVE',
          trainee: { branchId },
          endDate: { gte: now, lte: sevenDaysOut },
        },
        select: {
          id: true,
          endDate: true,
          trainee: { select: { name: true, user: { select: { name: true, phoneNumber: true } } } },
          plan: { select: { name: true } },
        },
        orderBy: { endDate: 'asc' },
        take: 5,
      }),
    ]);

    return {
      totalTrainees,
      newTraineesThisMonth,
      activeSubscriptions,
      newSubscriptionsThisMonth,
      expiringSoon,
    };
  });

  const [
    { totalTrainees, newTraineesThisMonth, activeSubscriptions, newSubscriptionsThisMonth, expiringSoon },
    income,
    outstandingBalances,
    todaySessions,
    activityTrend,
  ] = await Promise.all([
    countsAndExpiring,
    getIncomeSummary(tenantId, branchId, monthStart, now),
    getOutstandingBalance(tenantId, branchId),
    listSessions(tenantId, { branchId, dateFrom: today, dateTo: today, limit: 5 }),
    getActivityTrend(tenantId, branchId),
  ]);

  return {
    totalTrainees,
    newTraineesThisMonth,
    activeSubscriptions,
    newSubscriptionsThisMonth,
    revenueThisMonth: income.total,
    outstandingBalances,
    todaySessions: todaySessions.data,
    expiringSoon: expiringSoon.map((s) => ({
      id: s.id,
      traineeName: s.trainee.name,
      phoneNumber: s.trainee.user.phoneNumber,
      planName: s.plan.name,
      endDate: s.endDate,
    })),
    activityTrend,
  };
}

/**
 * Last 7 days of { date, checkIns, renewals } — daily AttendanceRecord and
 * TraineeSubscription counts, branch-scoped. 14 small count queries in
 * parallel; fine at this data scale, far simpler than a raw GROUP BY.
 */
async function getActivityTrend(tenantId: string, branchId: string) {
  const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));

  return withTenantContext(tenantId, async (tx) => {
    const counts = await Promise.all(
      days.map(async (day) => {
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);

        const [checkIns, renewals] = await Promise.all([
          tx.attendanceRecord.count({
            where: { branchId, markedAt: { gte: dayStart, lte: dayEnd } },
          }),
          tx.traineeSubscription.count({
            where: { trainee: { branchId }, createdAt: { gte: dayStart, lte: dayEnd } },
          }),
        ]);

        return { date: format(day, 'yyyy-MM-dd'), checkIns, renewals };
      })
    );

    return counts;
  });
}

// ─── Captain Dashboard ──────────────────────────────────────

export async function getCaptainDashboard(
  tenantId: string,
  branchId: string,
  captainProfileId: string
) {
  const today = todayDateString();

  return withTenantContext(tenantId, async (tx) => {
    const [myGroupsCount, groups] = await Promise.all([
      tx.group.count({ where: { captainId: captainProfileId, branchId, isActive: true } }),
      tx.group.findMany({
        where: { captainId: captainProfileId, branchId },
        select: { id: true },
      }),
    ]);

    const groupIds = groups.map((g) => g.id);

    const traineeRows = groupIds.length
      ? await tx.groupTrainee.findMany({
          where: { groupId: { in: groupIds } },
          select: { traineeId: true },
          distinct: ['traineeId'],
        })
      : [];

    const todaySessions = await listSessions(tenantId, {
      branchId,
      captainId: captainProfileId,
      dateFrom: today,
      dateTo: today,
    });

    return {
      myGroupsCount,
      myTraineesCount: traineeRows.length,
      todaySessions: todaySessions.data,
    };
  });
}
