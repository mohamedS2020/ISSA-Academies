/**
 * ISSA — Attendance Service
 *
 * Handles attendance marking, freeze/retake logic, and captain evaluations.
 *
 * ⚠️ BOTH RETAKE GUARDS: scheduleRetake() enforces BOTH:
 *    (1) freezeUsed < plan.freezeSessions
 *    (2) retakeDate ≤ subscription.endDate + plan.freezeRetakeDays
 *    Checking only the session count and skipping the date window allows
 *    retakes months after the subscription expired.
 *
 * ⚠️ ATTENDANCE UPSERT: AttendanceRecord has @@unique([sessionId, traineeId]).
 *    Always use upsert — not create — to allow Admin/Moderator corrections.
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { writeAuditLog } from './audit.service';
import { getBranchTimezone } from './branch.service';
import { toLocalDisplay } from '@/lib/utils/timezone';
import { getSubscriptionState } from '@/lib/utils/subscription';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/lib/api/error-handler';
import { AuditAction } from '@/types';
import { differenceInDays } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────

interface AttendanceEntry {
  traineeId: string;
  status: 'PRESENT' | 'ABSENT' | 'EXCUSED';
  notes?: string;
}

// ─── Submit Attendance ───────────────────────────────────────
//
// All upserts happen in one transaction. For each record:
//   PRESENT  → attendedSessions + 1
//   ABSENT   → freezeUsed + 1 (if quota allows)
//
// After all records, mark the session COMPLETED.

export async function submitAttendance(
  tenantId: string,
  branchId: string,
  sessionId: string,
  records: AttendanceEntry[],
  userId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    // Validate session exists and belongs to this branch
    const session = await tx.session.findFirst({
      where: { id: sessionId, branchId },
    });

    if (!session) throw new NotFoundError('Session not found');
    if (session.status === 'CANCELLED') {
      throw new BadRequestError('Cannot mark attendance for a cancelled session');
    }

    // Process each record
    const skippedTraineeIds: string[] = [];
    for (const record of records) {
      // ⚠️ Capture the PREVIOUS mark before upserting. Attendance uses upsert
      //    to allow corrections, so the subscription counters must adjust by
      //    the DELTA between the old and new status — blindly incrementing on
      //    every submit double-counts re-submissions and never reverses a
      //    changed mark (e.g. PRESENT → ABSENT).
      const prior = await tx.attendanceRecord.findUnique({
        where: {
          sessionId_traineeId: { sessionId, traineeId: record.traineeId },
        },
        select: { status: true },
      });
      const oldStatus = prior?.status ?? null;

      // The trainee's CURRENT subscription (latest, any status) + its plan's
      // grace window — needed to block ended trainees and to flip status.
      const subscription = await tx.traineeSubscription.findFirst({
        where: { traineeId: record.traineeId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          endDate: true,
          attendedSessions: true,
          totalSessions: true,
          expiredAt: true,
          plan: { select: { freezeRetakeDays: true } },
        },
      });

      // ⛔ Block NEW marks only once the grace window has fully elapsed. During
      //    the grace window (freezeRetakeDays after expiry) marking is still
      //    allowed for makeups/retakes. A CORRECTION of an existing mark is
      //    always allowed (so mistakes can be reversed).
      if (subscription && !prior) {
        const stateBefore = getSubscriptionState({
          status: subscription.status,
          endDate: subscription.endDate,
          attendedSessions: subscription.attendedSessions,
          totalSessions: subscription.totalSessions,
          expiredAt: subscription.expiredAt,
          freezeRetakeDays: subscription.plan.freezeRetakeDays,
        });
        if (stateBefore.pastGrace) {
          skippedTraineeIds.push(record.traineeId);
          continue;
        }
      }

      // ✅ UPSERT — not create. Allows Admin/Moderator corrections.
      const upserted = await tx.attendanceRecord.upsert({
        where: {
          sessionId_traineeId: {
            sessionId,
            traineeId: record.traineeId,
          },
        },
        create: {
          branchId,
          sessionId,
          traineeId: record.traineeId,
          status: record.status as any,
          markedBy: userId,
          notes: record.notes ?? null,
        },
        update: {
          status: record.status as any,
          markedBy: userId,
          notes: record.notes ?? null,
          markedAt: new Date(),
        },
      });

      if (subscription) {
        // PRESENT contributes to attendedSessions; ABSENT to freezeUsed.
        // Delta = (new contributes ? +1 : 0) − (old contributed ? +1 : 0).
        // Prisma `increment` accepts negatives, so corrections reverse cleanly.
        const attendedDelta =
          (record.status === 'PRESENT' ? 1 : 0) - (oldStatus === 'PRESENT' ? 1 : 0);
        const freezeDelta =
          (record.status === 'ABSENT' ? 1 : 0) - (oldStatus === 'ABSENT' ? 1 : 0);

        // Recompute whether the subscription is now over, so we can flip its
        // status the moment the last credit is used (or revive it if a
        // correction pushes attendance back below the cap and the date is
        // still valid).
        const newAttended = subscription.attendedSessions + attendedDelta;
        const nowEndedBySessions = newAttended >= subscription.totalSessions;
        const nowEndedByDate =
          Date.now() >= subscription.endDate.getTime() + 24 * 60 * 60 * 1000;
        const shouldBeExpired = nowEndedBySessions || nowEndedByDate;

        const statusData: Record<string, unknown> = {};
        if (shouldBeExpired && subscription.status === 'ACTIVE') {
          statusData.status = 'EXPIRED';
          statusData.expiredAt = subscription.expiredAt ?? new Date();
        } else if (!shouldBeExpired && subscription.status === 'EXPIRED') {
          // A correction reversed the overage and the date is still valid.
          statusData.status = 'ACTIVE';
          statusData.expiredAt = null;
        }

        if (
          attendedDelta !== 0 ||
          freezeDelta !== 0 ||
          Object.keys(statusData).length > 0
        ) {
          await tx.traineeSubscription.update({
            where: { id: subscription.id },
            data: {
              ...(attendedDelta !== 0 && {
                attendedSessions: { increment: attendedDelta },
              }),
              ...(freezeDelta !== 0 && {
                freezeUsed: { increment: freezeDelta },
              }),
              ...statusData,
            },
          });
        }
      }

      await writeAuditLog(tx, {
        branchId,
        userId,
        action: AuditAction.CREATE,
        entityType: 'attendance_record',
        entityId: upserted.id,
        newValues: { traineeId: record.traineeId, status: record.status, sessionId },
      });
    }

    // Mark session as COMPLETED
    await tx.session.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED' },
    });

    return {
      submitted: records.length - skippedTraineeIds.length,
      skipped: skippedTraineeIds.length,
    };
  });
}

// ─── Get Attendance Sheet for a Session ──────────────────────

export async function getAttendanceSheet(
  tenantId: string,
  branchId: string,
  sessionId: string
) {
  // Guard against a falsy id — Prisma treats `where: { id: undefined }` as
  // "no filter" and would return an arbitrary session instead of erroring.
  if (!sessionId) throw new NotFoundError('Session not found');
  const timezone = await getBranchTimezone(tenantId, branchId);
  return withTenantContext(tenantId, async (tx) => {
    const session = await tx.session.findFirst({
      where: { id: sessionId, branchId },
      include: {
        group: {
          include: {
            trainees: {
              include: {
                trainee: {
                  select: {
                    id: true,
                    name: true,
                    systemCode: true,
                    user: { select: { name: true } },
                    subscriptions: {
                      // Latest subscription (any status) so we can compute the
                      // ended/grace state, not just the active one.
                      orderBy: { createdAt: 'desc' },
                      take: 1,
                      select: {
                        id: true,
                        status: true,
                        endDate: true,
                        attendedSessions: true,
                        totalSessions: true,
                        freezeUsed: true,
                        expiredAt: true,
                        plan: { select: { freezeRetakeDays: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        attendanceRecords: true,
        evaluations: true,
      },
    });

    if (!session) throw new NotFoundError('Session not found');

    // Build a lookup map for existing attendance records
    const attendanceMap = new Map(
      session.attendanceRecords.map((r: any) => [r.traineeId, r])
    );

    const now = new Date();
    const trainees = session.group.trainees
      .map((gt: any) => {
        const sub = gt.trainee.subscriptions[0] ?? null;
        const existingAttendance = attendanceMap.get(gt.trainee.id) ?? null;

        // Compute the subscription lifecycle state (no sub → treat as past grace).
        const state = sub
          ? getSubscriptionState(
              {
                status: sub.status,
                endDate: sub.endDate,
                attendedSessions: sub.attendedSessions,
                totalSessions: sub.totalSessions,
                expiredAt: sub.expiredAt,
                freezeRetakeDays: sub.plan.freezeRetakeDays,
              },
              now
            )
          : { ended: true, withinGrace: false, pastGrace: true };

        return {
          traineeId: gt.trainee.id,
          systemCode: gt.trainee.systemCode,
          name: gt.trainee.name,
          activeSubscription: sub
            ? {
                id: sub.id,
                attendedSessions: sub.attendedSessions,
                totalSessions: sub.totalSessions,
                freezeUsed: sub.freezeUsed,
                status: sub.status,
              }
            : null,
          subscriptionEnded: state.ended, // greyed-out (expired / renewal reminder)
          // Markable during the grace window (makeup/retake) — only blocked
          // once the grace window has fully elapsed.
          canMark: !state.pastGrace,
          attendance: existingAttendance,
          _pastGrace: state.pastGrace,
        };
      })
      // Drop trainees whose grace window has elapsed — UNLESS they already have
      // an attendance record for THIS session (keep history visible/correctable).
      .filter((t: any) => !t._pastGrace || t.attendance !== null)
      .map(({ _pastGrace, ...t }: { _pastGrace: boolean }) => t);

    return {
      session: {
        id: session.id,
        status: session.status,
        scheduledAt: session.scheduledAt,
        scheduledAtLocal: toLocalDisplay(session.scheduledAt, timezone),
        durationMinutes: session.durationMinutes,
        groupId: session.groupId,
        groupName: session.group.name,
      },
      trainees,
    };
  });
}

// ─── List Attendance by Trainee ──────────────────────────────

export async function listAttendanceByTrainee(
  tenantId: string,
  branchId: string,
  traineeId: string,
  page = 1,
  limit = 20
) {
  return withTenantContext(tenantId, async (tx) => {
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      tx.attendanceRecord.findMany({
        where: { branchId, traineeId },
        orderBy: { markedAt: 'desc' },
        skip,
        take: limit,
        include: {
          session: {
            select: {
              scheduledAt: true,
              group: { select: { name: true } },
            },
          },
        },
      }),
      tx.attendanceRecord.count({ where: { branchId, traineeId } }),
    ]);

    return { data: records, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  });
}

// ─── Schedule Retake ─────────────────────────────────────────
//
// ⚠️ BOTH GUARDS ENFORCED:
//   (1) freezeUsed < plan.freezeSessions
//   (2) retakeDate ≤ subscription.endDate + plan.freezeRetakeDays

export async function scheduleRetake(
  tenantId: string,
  branchId: string,
  traineeId: string,
  subscriptionId: string,
  retakeSessionId: string,
  userId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const subscription = await tx.traineeSubscription.findFirst({
      where: { id: subscriptionId, traineeId },
      include: {
        plan: {
          select: { freezeSessions: true, freezeRetakeDays: true },
        },
      },
    });

    if (!subscription) throw new NotFoundError('Subscription not found');

    const retakeSession = await tx.session.findFirst({
      where: { id: retakeSessionId, branchId },
    });

    if (!retakeSession) throw new NotFoundError('Retake session not found');

    const retakeDate = retakeSession.scheduledAt;
    const daysSinceExpiry = differenceInDays(retakeDate, subscription.endDate);

    // ✅ Guard 1 — date window
    const withinWindow =
      daysSinceExpiry >= 0 &&
      daysSinceExpiry <= subscription.plan.freezeRetakeDays;

    if (!withinWindow) {
      throw new BadRequestError(
        `Retake window closed — must be within ${subscription.plan.freezeRetakeDays} days of subscription end`
      );
    }

    // ✅ Guard 2 — session count
    if (subscription.freezeUsed >= subscription.plan.freezeSessions) {
      throw new BadRequestError('No freeze sessions remaining');
    }

    const record = await tx.attendanceRecord.create({
      data: {
        branchId,
        sessionId: retakeSessionId,
        traineeId,
        status: 'PRESENT' as any,
        isRetake: true,
        markedBy: userId,
      },
    });

    await writeAuditLog(tx, {
      branchId,
      userId,
      action: AuditAction.CREATE,
      entityType: 'attendance_record_retake',
      entityId: record.id,
      newValues: { traineeId, retakeSessionId, subscriptionId },
    });

    return record;
  });
}

// ─── Evaluations ─────────────────────────────────────────────

export async function createEvaluation(
  tenantId: string,
  branchId: string,
  sessionId: string,
  traineeId: string,
  notes: string,
  evaluatorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const session = await tx.session.findFirst({
      where: { id: sessionId, branchId },
    });
    if (!session) throw new NotFoundError('Session not found');

    const evaluation = await tx.traineeEvaluation.create({
      data: { sessionId, traineeId, evaluatorId, notes },
    });

    return evaluation;
  });
}

export async function updateEvaluation(
  tenantId: string,
  evaluationId: string,
  evaluatorId: string,
  notes: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const evaluation = await tx.traineeEvaluation.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) throw new NotFoundError('Evaluation not found');
    if (evaluation.evaluatorId !== evaluatorId) {
      throw new ForbiddenError('You can only edit your own evaluations');
    }

    return tx.traineeEvaluation.update({
      where: { id: evaluationId },
      data: { notes },
    });
  });
}

export async function deleteEvaluation(
  tenantId: string,
  evaluationId: string,
  evaluatorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const evaluation = await tx.traineeEvaluation.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) throw new NotFoundError('Evaluation not found');
    if (evaluation.evaluatorId !== evaluatorId) {
      throw new ForbiddenError('You can only delete your own evaluations');
    }

    return tx.traineeEvaluation.delete({ where: { id: evaluationId } });
  });
}

export async function listEvaluationsBySession(
  tenantId: string,
  sessionId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    return tx.traineeEvaluation.findMany({
      where: { sessionId },
      include: {
        trainee: { select: { id: true, name: true, user: { select: { name: true } } } },
        evaluator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });
}
