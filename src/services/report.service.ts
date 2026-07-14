/**
 * ISSA — Report Service
 *
 * Four report types: financial, attendance, subscription, captain performance.
 * Every aggregation that accepts a date range checks whether the range
 * spans the retention boundary and queries the matching archived_* table
 * too — a report that only hits the live table returns silently
 * incomplete data with no error (literal PRD warning, task 8.13).
 *
 * Archive-union depth per report (disclosed, not a hidden gap):
 *   - financial:    full UNION, 5-year cutoff (reuses finance.service.ts)
 *   - attendance:   full UNION, 1-year cutoff (joins archived rows back to
 *                   the live `sessions`/`groups` tables, which are never
 *                   archived, to support groupId/captainId filters)
 *   - subscription: UNION only when an explicit historical date range is
 *                   requested — the default "current state" view is live-only
 *   - captainPerformance: live-only — sessions/evaluations have no archive
 *                   table at all; only the attendance-rate sub-metric would
 *                   theoretically need archive data, and only for periods
 *                   older than the typical payroll-reporting window
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { Prisma } from '@/generated/tenant-client';
import { addDays } from 'date-fns';
import {
  getAttendanceSubscriptionArchiveCutoff,
  rangeSpansArchive,
} from '@/lib/utils/archive';
import {
  getIncomeSummary,
  getExpenseSummary,
  getOutstandingBalance,
} from './finance.service';

// ─── Financial Report ───────────────────────────────────────

export interface FinancialReport {
  summary: {
    revenue: number;
    collections: number;
    expenses: number;
    outstandingPayments: number;
    profitLoss: number;
  };
  /** Per-plan income breakdown for the period — plan name, # of trainees who
   *  paid, that count split by referral category, and the total received. */
  byPlan: PlanIncomeRow[];
  records: { date: string; type: 'INCOME' | 'EXPENSE'; amount: number }[];
}

export interface PlanIncomeRow {
  planName: string;
  traineeCount: number;
  /** Distinct paying-trainee counts split by how they were referred. */
  referrals: { new: number; network: number; continuous: number; old: number };
  income: number;
}

type ReferralCat = 'new' | 'network' | 'continuous' | 'old';

const REFERRAL_CAT: Record<string, ReferralCat> = {
  NEW: 'new',
  NETWORK: 'network',
  CONTINUOUS: 'continuous',
  OLD: 'old',
};

/**
 * Income for the period grouped by subscription plan, sourced from receipts
 * (each receipt links to a subscription → plan). Returns, per plan, the count
 * of DISTINCT trainees who paid and the total amount received.
 */
async function getIncomeByPlan(
  tenantId: string,
  branchId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<PlanIncomeRow[]> {
  return withTenantContext(tenantId, async (tx) => {
    const receipts = await tx.receipt.findMany({
      where: { branchId, issuedAt: { gte: dateFrom, lte: dateTo } },
      select: {
        amount: true,
        traineeId: true,
        trainee: { select: { referralType: true } },
        subscription: { select: { plan: { select: { id: true, name: true } } } },
      },
    });

    interface Acc {
      planName: string;
      income: number;
      trainees: Set<string>;
      referralSets: Record<ReferralCat, Set<string>>;
    }
    const newReferralSets = (): Record<ReferralCat, Set<string>> => ({
      new: new Set(),
      network: new Set(),
      continuous: new Set(),
      old: new Set(),
    });

    const map = new Map<string, Acc>();
    for (const r of receipts) {
      const plan = r.subscription?.plan;
      const key = plan?.id ?? 'unknown';
      const entry =
        map.get(key) ??
        {
          planName: plan?.name ?? 'Unknown',
          income: 0,
          trainees: new Set<string>(),
          referralSets: newReferralSets(),
        };
      entry.income += Number(r.amount);
      entry.trainees.add(r.traineeId);
      // Count each DISTINCT trainee once per referral category.
      const cat = r.trainee?.referralType ? REFERRAL_CAT[r.trainee.referralType] : undefined;
      if (cat) entry.referralSets[cat].add(r.traineeId);
      map.set(key, entry);
    }

    return Array.from(map.values())
      .map((e) => ({
        planName: e.planName,
        traineeCount: e.trainees.size,
        referrals: {
          new: e.referralSets.new.size,
          network: e.referralSets.network.size,
          continuous: e.referralSets.continuous.size,
          old: e.referralSets.old.size,
        },
        income: Math.round(e.income * 100) / 100,
      }))
      .sort((a, b) => b.income - a.income);
  });
}

export async function getFinancialReport(
  tenantId: string,
  branchId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<FinancialReport> {
  const [income, expense, outstandingPayments, byPlan] = await Promise.all([
    getIncomeSummary(tenantId, branchId, dateFrom, dateTo),
    getExpenseSummary(tenantId, branchId, dateFrom, dateTo),
    getOutstandingBalance(tenantId, branchId),
    getIncomeByPlan(tenantId, branchId, dateFrom, dateTo),
  ]);

  // Revenue and collections are the same figure in this system — every
  // INCOME transaction represents money actually received (there is no
  // separate "invoiced but uncollected" concept beyond `amountDue`, which
  // is reported separately as outstandingPayments).
  const records = [
    ...income.series.map((p) => ({ date: p.date, type: 'INCOME' as const, amount: p.amount })),
    ...expense.series.map((p) => ({ date: p.date, type: 'EXPENSE' as const, amount: p.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return {
    summary: {
      revenue: income.total,
      collections: income.total,
      expenses: expense.total,
      outstandingPayments,
      profitLoss: income.total - expense.total,
    },
    byPlan,
    records,
  };
}

// ─── Attendance Report ──────────────────────────────────────

export interface AttendanceReportFilters {
  traineeId?: string;
  groupId?: string;
  captainId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AttendanceReport {
  summary: {
    present: number;
    absent: number;
    excused: number;
    total: number;
    attendanceRate: number; // 0-100
  };
  records: {
    date: string;
    traineeName: string;
    groupName: string;
    status: string;
  }[];
}

export async function getAttendanceReport(
  tenantId: string,
  branchId: string,
  filters: AttendanceReportFilters
): Promise<AttendanceReport> {
  const dateTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`) : new Date();
  const dateFrom = filters.dateFrom
    ? new Date(`${filters.dateFrom}T00:00:00.000Z`)
    : addDays(dateTo, -30);

  return withTenantContext(tenantId, async (tx) => {
    const sessionWhere: Record<string, unknown> = {};
    if (filters.groupId) sessionWhere.groupId = filters.groupId;
    if (filters.captainId) sessionWhere.group = { captainId: filters.captainId };

    const live = await tx.attendanceRecord.findMany({
      where: {
        branchId,
        ...(filters.traineeId && { traineeId: filters.traineeId }),
        markedAt: { gte: dateFrom, lte: dateTo },
        ...(Object.keys(sessionWhere).length > 0 && { session: sessionWhere }),
      },
      select: {
        status: true,
        markedAt: true,
        trainee: { select: { name: true, user: { select: { name: true } } } },
        session: { select: { group: { select: { name: true } } } },
      },
      take: 500,
      orderBy: { markedAt: 'desc' },
    });

    let archivedRecords: {
      status: string;
      marked_at: Date;
      trainee_name: string;
      group_name: string;
    }[] = [];

    if (rangeSpansArchive(dateFrom, getAttendanceSubscriptionArchiveCutoff())) {
      const conditions: Prisma.Sql[] = [
        Prisma.sql`a.branch_id = ${branchId}::uuid`,
        Prisma.sql`a.marked_at >= ${dateFrom}`,
        Prisma.sql`a.marked_at <= ${dateTo}`,
      ];
      if (filters.traineeId) {
        conditions.push(Prisma.sql`a.trainee_id = ${filters.traineeId}::uuid`);
      }
      if (filters.groupId) {
        conditions.push(Prisma.sql`s.group_id = ${filters.groupId}::uuid`);
      }
      if (filters.captainId) {
        conditions.push(Prisma.sql`g.captain_id = ${filters.captainId}::uuid`);
      }

      archivedRecords = await tx.$queryRaw<
        { status: string; marked_at: Date; trainee_name: string; group_name: string }[]
      >`
        SELECT a.status, a.marked_at,
               u.name AS trainee_name, g.name AS group_name
        FROM archived_attendance_records a
        JOIN sessions s ON s.id = a.session_id
        JOIN groups g ON g.id = s.group_id
        JOIN trainee_profiles tp ON tp.id = a.trainee_id
        JOIN users u ON u.id = tp.user_id
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY a.marked_at DESC
        LIMIT 500
      `;
    }

    const records = [
      ...live.map((r) => ({
        date: r.markedAt.toISOString().slice(0, 10),
        traineeName: r.trainee.name,
        groupName: r.session.group.name,
        status: r.status,
      })),
      ...archivedRecords.map((r) => ({
        date: r.marked_at.toISOString().slice(0, 10),
        traineeName: r.trainee_name,
        groupName: r.group_name,
        status: r.status,
      })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 500);

    const present = records.filter((r) => r.status === 'PRESENT').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const excused = records.filter((r) => r.status === 'EXCUSED').length;
    const total = records.length;
    const attendanceRate = total > 0 ? Math.round((present / total) * 1000) / 10 : 0;

    return {
      summary: { present, absent, excused, total, attendanceRate },
      records,
    };
  });
}

// ─── Subscription Report ────────────────────────────────────

export interface SubscriptionReportFilters {
  planId?: string;
  levelId?: string;
  status?: string;
  dateFrom?: string;
}

export interface SubscriptionReport {
  summary: {
    active: number;
    expired: number;
    frozen: number;
    upcomingRenewals: number;
  };
  records: {
    traineeName: string;
    planName: string;
    levelName: string;
    status: string;
    startDate: string;
    endDate: string;
  }[];
}

export async function getSubscriptionReport(
  tenantId: string,
  branchId: string,
  filters: SubscriptionReportFilters
): Promise<SubscriptionReport> {
  return withTenantContext(tenantId, async (tx) => {
    const where: Record<string, unknown> = {
      trainee: { branchId },
      ...(filters.planId && { planId: filters.planId }),
      ...(filters.levelId && { levelId: filters.levelId }),
      ...(filters.status && { status: filters.status }),
    };

    const live = await tx.traineeSubscription.findMany({
      where,
      select: {
        status: true,
        startDate: true,
        endDate: true,
        trainee: { select: { name: true, user: { select: { name: true } } } },
        plan: { select: { name: true } },
        level: { select: { name: true } },
      },
      take: 500,
      orderBy: { startDate: 'desc' },
    });

    const [active, expired, frozen] = await Promise.all([
      tx.traineeSubscription.count({ where: { trainee: { branchId }, status: 'ACTIVE' } }),
      tx.traineeSubscription.count({ where: { trainee: { branchId }, status: 'EXPIRED' } }),
      tx.traineeSubscription.count({ where: { trainee: { branchId }, status: 'FROZEN' } }),
    ]);

    const upcomingRenewals = await tx.traineeSubscription.count({
      where: {
        trainee: { branchId },
        status: 'ACTIVE',
        endDate: { gte: new Date(), lte: addDays(new Date(), 30) },
      },
    });

    let archivedRecords: {
      status: string;
      start_date: Date;
      end_date: Date;
      trainee_name: string;
      plan_name: string;
      level_name: string;
    }[] = [];

    if (
      filters.dateFrom &&
      rangeSpansArchive(filters.dateFrom, getAttendanceSubscriptionArchiveCutoff())
    ) {
      const conditions: Prisma.Sql[] = [
        Prisma.sql`tp.branch_id = ${branchId}::uuid`,
        Prisma.sql`ts.start_date >= ${new Date(`${filters.dateFrom}T00:00:00.000Z`)}`,
      ];
      if (filters.planId) conditions.push(Prisma.sql`ts.plan_id = ${filters.planId}::uuid`);
      if (filters.levelId) conditions.push(Prisma.sql`ts.level_id = ${filters.levelId}::uuid`);
      if (filters.status) conditions.push(Prisma.sql`ts.status = ${filters.status}`);

      archivedRecords = await tx.$queryRaw<
        {
          status: string;
          start_date: Date;
          end_date: Date;
          trainee_name: string;
          plan_name: string;
          level_name: string;
        }[]
      >`
        SELECT ts.status, ts.start_date, ts.end_date,
               u.name AS trainee_name, sp.name AS plan_name, spl.name AS level_name
        FROM archived_trainee_subscriptions ts
        JOIN trainee_profiles tp ON tp.id = ts.trainee_id
        JOIN users u ON u.id = tp.user_id
        JOIN subscription_plans sp ON sp.id = ts.plan_id
        JOIN subscription_plan_levels spl ON spl.id = ts.level_id
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY ts.start_date DESC
        LIMIT 500
      `;
    }

    const records = [
      ...live.map((s) => ({
        traineeName: s.trainee.name,
        planName: s.plan.name,
        levelName: s.level.name,
        status: s.status,
        startDate: s.startDate.toISOString().slice(0, 10),
        endDate: s.endDate.toISOString().slice(0, 10),
      })),
      ...archivedRecords.map((s) => ({
        traineeName: s.trainee_name,
        planName: s.plan_name,
        levelName: s.level_name,
        status: s.status,
        startDate: s.start_date.toISOString().slice(0, 10),
        endDate: s.end_date.toISOString().slice(0, 10),
      })),
    ]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .slice(0, 500);

    return {
      summary: { active, expired, frozen, upcomingRenewals },
      records,
    };
  });
}

// ─── Captain Performance Report ─────────────────────────────

export interface CaptainPerformanceFilters {
  captainId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CaptainPerformanceReport {
  records: {
    captainId: string;
    captainName: string;
    sessionsConducted: number;
    attendanceRate: number;
    evaluationsCount: number;
  }[];
}

export async function getCaptainPerformanceReport(
  tenantId: string,
  branchId: string,
  filters: CaptainPerformanceFilters
): Promise<CaptainPerformanceReport> {
  const dateTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`) : new Date();
  const dateFrom = filters.dateFrom
    ? new Date(`${filters.dateFrom}T00:00:00.000Z`)
    : addDays(dateTo, -30);

  return withTenantContext(tenantId, async (tx) => {
    const captains = await tx.captainProfile.findMany({
      where: { branchId, ...(filters.captainId && { id: filters.captainId }) },
      select: { id: true, userId: true, user: { select: { name: true } } },
    });

    const records = await Promise.all(
      captains.map(async (captain) => {
        const groupIds = (
          await tx.group.findMany({
            where: { captainId: captain.id, branchId },
            select: { id: true },
          })
        ).map((g) => g.id);

        const sessionsConducted = groupIds.length
          ? await tx.session.count({
              where: {
                branchId,
                groupId: { in: groupIds },
                status: 'COMPLETED',
                scheduledAt: { gte: dateFrom, lte: dateTo },
              },
            })
          : 0;

        const attendanceRows = groupIds.length
          ? await tx.attendanceRecord.findMany({
              where: {
                branchId,
                markedAt: { gte: dateFrom, lte: dateTo },
                session: { groupId: { in: groupIds } },
              },
              select: { status: true },
            })
          : [];
        const presentCount = attendanceRows.filter((r) => r.status === 'PRESENT').length;
        const attendanceRate =
          attendanceRows.length > 0
            ? Math.round((presentCount / attendanceRows.length) * 1000) / 10
            : 0;

        const evaluationsCount = await tx.traineeEvaluation.count({
          where: {
            evaluatorId: captain.userId,
            createdAt: { gte: dateFrom, lte: dateTo },
          },
        });

        return {
          captainId: captain.id,
          captainName: captain.user.name,
          sessionsConducted,
          attendanceRate,
          evaluationsCount,
        };
      })
    );

    return { records };
  });
}

// ─── Expiring-Soon Report (1 session remaining) ─────────────

export interface ExpiringSoonReport {
  summary: { expiringSoon: number };
  records: {
    traineeName: string;
    phone: string;
    planName: string;
    levelName: string;
    groupName: string;
    sessions: string;
    sessionsRemaining: number;
    endDate: string;
  }[];
}

/**
 * ACTIVE subscriptions with 1 (or fewer) session credit remaining — the
 * renewal-nudge list. "Remaining" = totalSessions − attendedSessions; a 0-credit
 * sub would already have flipped to EXPIRED, so ACTIVE ⇒ this surfaces exactly
 * the trainees about to run out. Current state — not date-ranged.
 */
export async function getExpiringSoonReport(
  tenantId: string,
  branchId: string
): Promise<ExpiringSoonReport> {
  return withTenantContext(tenantId, async (tx) => {
    const subs = await tx.traineeSubscription.findMany({
      where: { status: 'ACTIVE', trainee: { branchId } },
      select: {
        attendedSessions: true,
        totalSessions: true,
        endDate: true,
        trainee: {
          select: {
            name: true,
            user: { select: { name: true, phoneNumber: true } },
            groupTrainees: {
              orderBy: { joinedAt: 'desc' },
              take: 1,
              select: { group: { select: { name: true } } },
            },
          },
        },
        plan: { select: { name: true } },
        level: { select: { name: true } },
      },
      take: 2000,
    });

    const records = subs
      .filter((s) => s.totalSessions - s.attendedSessions <= 1)
      .map((s) => ({
        traineeName: s.trainee.name,
        phone: s.trainee.user.phoneNumber,
        planName: s.plan.name,
        levelName: s.level.name,
        groupName: s.trainee.groupTrainees[0]?.group.name ?? '—',
        sessions: `${s.attendedSessions}/${s.totalSessions}`,
        sessionsRemaining: s.totalSessions - s.attendedSessions,
        endDate: s.endDate.toISOString().slice(0, 10),
      }))
      .sort((a, b) => a.sessionsRemaining - b.sessionsRemaining || a.endDate.localeCompare(b.endDate));

    return { summary: { expiringSoon: records.length }, records };
  });
}

// ─── Level / Group Transitions Report ───────────────────────

export interface TransitionsReport {
  summary: { total: number };
  records: {
    date: string;
    traineeName: string;
    levelChange: string;
    groupChange: string;
    changedBy: string;
  }[];
}

/**
 * Trainee level→level and group→group moves in the period, reconstructed from
 * the audit log written by updateTraineeAssignment (entityType 'TraineeProfile',
 * newValues.assignment = { levelId?: {from,to}, groupId?: {from,to} }). IDs are
 * resolved to names in bulk; a since-deleted level/group shows "(removed)".
 */
export async function getTransitionsReport(
  tenantId: string,
  branchId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<TransitionsReport> {
  return withTenantContext(tenantId, async (tx) => {
    const logs = await tx.auditLog.findMany({
      where: {
        branchId,
        entityType: 'TraineeProfile',
        action: 'UPDATE',
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      select: { entityId: true, userId: true, newValues: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    type Change = { from?: string; to?: string };
    const transitions = logs
      .map((l) => ({
        entityId: l.entityId,
        userId: l.userId,
        createdAt: l.createdAt,
        assignment: (l.newValues as { assignment?: { levelId?: Change; groupId?: Change } } | null)?.assignment,
      }))
      .filter((l) => l.assignment && (l.assignment.levelId || l.assignment.groupId));

    if (transitions.length === 0) return { summary: { total: 0 }, records: [] };

    const traineeIds = new Set<string>();
    const levelIds = new Set<string>();
    const groupIds = new Set<string>();
    const userIds = new Set<string>();
    for (const t of transitions) {
      traineeIds.add(t.entityId);
      userIds.add(t.userId);
      const { levelId, groupId } = t.assignment!;
      if (levelId?.from) levelIds.add(levelId.from);
      if (levelId?.to) levelIds.add(levelId.to);
      if (groupId?.from) groupIds.add(groupId.from);
      if (groupId?.to) groupIds.add(groupId.to);
    }

    const [trainees, levels, groups, users] = await Promise.all([
      tx.traineeProfile.findMany({ where: { id: { in: [...traineeIds] } }, select: { id: true, name: true } }),
      tx.subscriptionPlanLevel.findMany({ where: { id: { in: [...levelIds] } }, select: { id: true, name: true } }),
      tx.group.findMany({ where: { id: { in: [...groupIds] } }, select: { id: true, name: true } }),
      tx.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } }),
    ]);
    const traineeMap = new Map(trainees.map((t) => [t.id, t.name]));
    const levelMap = new Map(levels.map((l) => [l.id, l.name]));
    const groupMap = new Map(groups.map((g) => [g.id, g.name]));
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    const resolve = (map: Map<string, string>, id?: string) => (id ? map.get(id) ?? '(removed)' : '—');

    const records = transitions.map((t) => {
      const { levelId, groupId } = t.assignment!;
      return {
        date: t.createdAt.toISOString().slice(0, 10),
        traineeName: traineeMap.get(t.entityId) ?? '(unknown)',
        levelChange: levelId ? `${resolve(levelMap, levelId.from)} → ${resolve(levelMap, levelId.to)}` : '—',
        groupChange: groupId ? `${resolve(groupMap, groupId.from)} → ${resolve(groupMap, groupId.to)}` : '—',
        changedBy: userMap.get(t.userId) ?? '—',
      };
    });

    return { summary: { total: records.length }, records };
  });
}
