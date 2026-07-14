/**
 * ISSA — Portal Service
 *
 * Composes existing service functions with a trainee-self-scoping layer.
 *
 * ⚠️ TRAINEE SELF-SCOPING: every function here resolves `traineeId` from
 *    the authenticated user's own profile (`ctx.userId` → `TraineeProfile.id`
 *    via resolveOwnTraineeId) — never from caller input (query params or
 *    request body). This is a narrower isolation dimension than branch
 *    isolation and has no existing isolation test coverage, so the
 *    resolution is centralized here rather than repeated per-route.
 *
 * Almost everything below is a thin wrapper around functions that already
 * exist — schedule.service.ts::listSessions, attendance.service.ts::
 * listAttendanceByTrainee, receipt.service.ts::listReceipts/getReceiptById,
 * and trainee.service.ts::getTraineeById are all already trainee-filterable
 * or trainee-keyed. The only genuinely new logic is the resolver itself and
 * the ownership check on receipt download.
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { NotFoundError } from '@/lib/api/error-handler';
import { getSubscriptionState } from '@/lib/utils/subscription';
import { listSessions, type SessionFilters } from './schedule.service';
import { listAttendanceByTrainee } from './attendance.service';
import { getTraineeById } from './trainee.service';
import {
  listReceipts,
  getReceiptById,
  type ReceiptListQuery,
} from './receipt.service';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Resolve Own Trainee ────────────────────────────────────

/**
 * Maps the authenticated user's JWT `userId` to their own `TraineeProfile.id`.
 * This is the ONLY place a portal route should derive "which trainee".
 */
export async function resolveOwnTraineeId(
  tenantId: string,
  branchId: string,
  userId: string
): Promise<string> {
  return withTenantContext(tenantId, async (tx) => {
    const trainee = await tx.traineeProfile.findFirst({
      where: { userId, branchId },
      select: { id: true },
    });
    if (!trainee) throw new NotFoundError('Trainee profile not found');
    return trainee.id;
  });
}

/**
 * Validate that `traineeId` belongs to the authenticated account (userId) and
 * return it. When `traineeId` is omitted, defaults to the account's FIRST
 * trainee. This is the ownership gate for the multi-trainee portal — a caller
 * can never read another account's trainee by passing its id (404 otherwise).
 */
export async function resolveOwnTrainee(
  tenantId: string,
  branchId: string,
  userId: string,
  traineeId?: string
): Promise<string> {
  return withTenantContext(tenantId, async (tx) => {
    if (traineeId) {
      const owned = await tx.traineeProfile.findFirst({
        where: { id: traineeId, userId, branchId },
        select: { id: true },
      });
      if (!owned) throw new NotFoundError('Trainee profile not found');
      return owned.id;
    }
    const first = await tx.traineeProfile.findFirst({
      where: { userId, branchId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!first) throw new NotFoundError('Trainee profile not found');
    return first.id;
  });
}

/**
 * All trainees managed by the authenticated account — powers the portal's
 * trainee switcher (a guardian with several children).
 */
export async function getOwnTrainees(
  tenantId: string,
  branchId: string,
  userId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    return tx.traineeProfile.findMany({
      where: { userId, branchId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, systemCode: true },
    });
  });
}

/**
 * The trainee's schedule window:
 *   - `ended: true`  → subscription is over (date reached, all sessions used,
 *     or no subscription). The schedule is hidden entirely.
 *   - `ended: false` → `endDate` caps the schedule so the trainee never sees
 *     sessions beyond the period they're enrolled for.
 */
async function getScheduleWindow(
  tenantId: string,
  traineeId: string
): Promise<{ ended: boolean; endDate?: string }> {
  const sub = await withTenantContext(tenantId, (tx) =>
    tx.traineeSubscription.findFirst({
      where: { traineeId },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        endDate: true,
        attendedSessions: true,
        totalSessions: true,
        expiredAt: true,
        plan: { select: { freezeRetakeDays: true } },
      },
    })
  );

  if (!sub) return { ended: true };

  const state = getSubscriptionState({
    status: sub.status,
    endDate: sub.endDate,
    attendedSessions: sub.attendedSessions,
    totalSessions: sub.totalSessions,
    expiredAt: sub.expiredAt,
    freezeRetakeDays: sub.plan.freezeRetakeDays,
  });

  if (state.ended) return { ended: true };
  return { ended: false, endDate: sub.endDate.toISOString().slice(0, 10) };
}

// ─── Dashboard ──────────────────────────────────────────────

export async function getPortalDashboard(
  tenantId: string,
  branchId: string,
  userId: string,
  requestedTraineeId?: string
) {
  const traineeId = await resolveOwnTrainee(tenantId, branchId, userId, requestedTraineeId);
  const window = await getScheduleWindow(tenantId, traineeId);

  const [trainee, upcoming] = await Promise.all([
    getTraineeById(tenantId, branchId, traineeId),
    // Hide upcoming sessions entirely once the subscription has ended.
    window.ended
      ? Promise.resolve({ data: [] as unknown[] })
      : listSessions(tenantId, {
          branchId,
          traineeId,
          status: 'SCHEDULED',
          dateFrom: todayDateString(),
          dateTo: window.endDate,
          limit: 5,
        }),
  ]);

  return {
    trainee: {
      name: trainee.name,
      systemCode: trainee.systemCode,
    },
    activeSubscription: trainee.subscriptions[0] ?? null,
    upcomingSessions: upcoming.data,
  };
}

// ─── Schedule ───────────────────────────────────────────────

export interface PortalScheduleQuery {
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export async function getPortalSchedule(
  tenantId: string,
  branchId: string,
  userId: string,
  query: PortalScheduleQuery,
  requestedTraineeId?: string
) {
  const traineeId = await resolveOwnTrainee(tenantId, branchId, userId, requestedTraineeId);
  const window = await getScheduleWindow(tenantId, traineeId);

  // Once the subscription has ended, hide the schedule entirely.
  if (window.ended) {
    return {
      data: [],
      pagination: { page: 1, limit: query.limit ?? 20, total: 0, totalPages: 0 },
    };
  }

  // Cap the upper bound at the subscription end date — the earlier of the
  // caller's requested dateTo and the subscription end.
  const dateTo =
    window.endDate && (!query.dateTo || window.endDate < query.dateTo)
      ? window.endDate
      : query.dateTo;

  const filters: SessionFilters = {
    branchId,
    traineeId,
    status: 'SCHEDULED',
    dateFrom: query.dateFrom ?? todayDateString(),
    dateTo,
    page: query.page,
    limit: query.limit,
  };

  return listSessions(tenantId, filters);
}

// ─── Attendance ─────────────────────────────────────────────

export async function getPortalAttendance(
  tenantId: string,
  branchId: string,
  userId: string,
  page = 1,
  limit = 20,
  requestedTraineeId?: string
) {
  const traineeId = await resolveOwnTrainee(tenantId, branchId, userId, requestedTraineeId);
  return listAttendanceByTrainee(tenantId, branchId, traineeId, page, limit);
}

// ─── Subscription ───────────────────────────────────────────

export async function getPortalSubscription(
  tenantId: string,
  branchId: string,
  userId: string,
  requestedTraineeId?: string
) {
  const traineeId = await resolveOwnTrainee(tenantId, branchId, userId, requestedTraineeId);
  const trainee = await getTraineeById(tenantId, branchId, traineeId);

  const subscription = trainee.subscriptions[0];
  if (!subscription) {
    return { hasActiveSubscription: false as const, subscription: null };
  }

  return {
    hasActiveSubscription: true as const,
    subscription: {
      planName: subscription.plan.name,
      levelName: subscription.level.name,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      totalSessions: subscription.totalSessions,
      attendedSessions: subscription.attendedSessions,
      sessionsRemaining: subscription.totalSessions - subscription.attendedSessions,
      freezeUsed: subscription.freezeUsed,
      freezeAllowed: subscription.plan.freezeSessions,
      paymentStatus: subscription.paymentStatus,
      amountPaid: subscription.amountPaid,
      amountDue: subscription.amountDue,
    },
  };
}

// ─── Receipts ───────────────────────────────────────────────

export async function getPortalReceipts(
  tenantId: string,
  branchId: string,
  userId: string,
  query: Omit<ReceiptListQuery, 'traineeId'>,
  requestedTraineeId?: string
) {
  const traineeId = await resolveOwnTrainee(tenantId, branchId, userId, requestedTraineeId);
  return listReceipts(tenantId, branchId, { ...query, traineeId });
}

/**
 * Resolve a single receipt for download — ownership-checked.
 *
 * Returns 404 (not 403) when the receipt belongs to someone else, to
 * avoid confirming the receipt's existence to a non-owner.
 */
export async function getOwnReceiptForDownload(
  tenantId: string,
  branchId: string,
  userId: string,
  receiptId: string
) {
  const receipt = await getReceiptById(tenantId, branchId, receiptId);

  // The receipt's trainee must belong to this account (any of the guardian's
  // children) — resolveOwnTrainee throws 404 if it does not.
  await resolveOwnTrainee(tenantId, branchId, userId, receipt.traineeId);

  return receipt;
}
