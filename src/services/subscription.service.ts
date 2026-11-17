/**
 * Subscription Service
 *
 * Handles subscription plan CRUD, trainee enrollment, and renewal (queued
 * renewals and their activation: see the Renewal section).
 *
 * Critical invariants:
 *   1. periodDays must be non-null before addDays() when periodType = FROM_SUBSCRIPTION_DATE
 *   2. At most ONE active subscription per trainee — enforced by the partial
 *      unique index `trainee_subscriptions_one_active_per_trainee`, not by the
 *      application check. See the note below.
 *   3. Enrollment = subscription + group assignment + receipt in ONE atomic tx
 *   4. Receipt numbers come from an atomic per-branch counter (receipt.service)
 *   5. Every plan query includes branchId for strict branch isolation
 *
 * ⚠️ A TRANSACTION DOES NOT MAKE A READ-THEN-WRITE SAFE.
 *
 * This file previously claimed the one-active check was safe because it ran
 * "INSIDE the transaction", and that MAX+1 receipt numbering was safe for the
 * same reason. Neither was true. At Postgres's default isolation (READ
 * COMMITTED) a transaction does not lock rows it only reads, so two concurrent
 * enrollments both read "no active subscription" and both created one — a
 * double charge, reproduced in 6 of 10 staggered attempts.
 *
 * The application checks below are still worth keeping: they give the common,
 * sequential case a clear message without touching the index. But correctness
 * comes from the database constraint, which holds however requests interleave.
 */

import { addDays, endOfMonth, startOfMonth } from 'date-fns';
import {
  withTenantContext,
  type Prisma,
  type TransactionClient,
} from '@/lib/db/tenant-client';
import { writeAuditLog } from './audit.service';
import { generateReceiptNumber } from './receipt.service';
import { placeTraineeInGroup } from './group.service';
import { recordLedgerEntry } from './ledger';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '@/lib/api/error-handler';
import { AuditAction } from '@/types';
import {
  activationWindow,
  addUtcDays,
  isStillRunning,
  paymentStatusFor,
  renewalWindow,
  utcDay,
} from '@/lib/utils/renewal';
import type {
  CreatePlanInput,
  UpdatePlanInput,
  ListPlansQuery,
  EnrollInput,
  RenewInput,
  RenewPreviewQuery,
} from '@/schemas/subscription.schema';
import type { RecordPaymentInput } from '@/schemas/finance.schema';

// ─── One active subscription per trainee ──────────────────────

/**
 * Shown when the database's one-active guard rejects an insert. Worded for the
 * situation that actually produces it: another request created or renewed a
 * subscription for this trainee a moment ago, after this one had already
 * passed its own check.
 */
const CONCURRENT_ACTIVE_SUBSCRIPTION =
  'This trainee already has an active subscription — another request may have ' +
  'just created it. Refresh to see the current subscription.';

/**
 * True when an error is the `trainee_subscriptions_one_active_per_trainee`
 * partial index rejecting a second ACTIVE subscription.
 *
 * Duck-typed on the Prisma error code rather than `instanceof`, because the
 * tenant and platform clients each ship their own error classes. The partial
 * index is the only unique rule on this table involving `trainee_id`, so P2002
 * naming that column (or the index) identifies it unambiguously.
 */
function isDuplicateActiveSubscription(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: { target?: unknown } };
  if (code !== 'P2002') return false;
  const target = JSON.stringify(meta?.target ?? '');
  return target.includes('trainee_id') || target.includes('one_active_per_trainee');
}

/**
 * Insert an ACTIVE subscription, translating the database's one-active guard
 * into the business error callers already handle.
 *
 * This function does not enforce anything — the partial unique index does. It
 * only makes sure the losing side of a race gets a clear 409 rather than a raw
 * database error. Shared by enrollment and renewal so the two cannot drift
 * apart on how they handle it.
 */
async function insertActiveSubscription(
  tx: TransactionClient,
  data: Omit<Prisma.TraineeSubscriptionUncheckedCreateInput, 'status'>
) {
  try {
    return await tx.traineeSubscription.create({ data: { ...data, status: 'ACTIVE' } });
  } catch (err) {
    if (isDuplicateActiveSubscription(err)) {
      throw new ConflictError(CONCURRENT_ACTIVE_SUBSCRIPTION);
    }
    throw err;
  }
}

// ─── Trainee in this branch ───────────────────────────────────

/**
 * Refuse a trainee id that is not in the caller's branch. The plan and group
 * were always checked against the branch, the trainee never was: a moderator
 * could enroll another branch's trainee into their own branch, given its id.
 */
async function assertTraineeInBranch(
  tx: TransactionClient,
  traineeId: string,
  branchId: string
): Promise<void> {
  const trainee = await tx.traineeProfile.findFirst({
    where: { id: traineeId, branchId },
    select: { id: true },
  });
  if (!trainee) throw new NotFoundError('Trainee not found');
}

// ─── Plan CRUD ────────────────────────────────────────────────

export async function createPlan(
  tenantId: string,
  branchId: string,
  input: CreatePlanInput,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const plan = await tx.subscriptionPlan.create({
      data: {
        branchId,
        name: input.name,
        minSessions: input.minSessions,
        periodType: input.periodType,
        periodDays: input.periodType === 'FROM_SUBSCRIPTION_DATE' ? input.periodDays! : null,
        freezeSessions: input.freezeSessions,
        freezeRetakeDays: input.freezeRetakeDays,
        amount: input.amount,
        levels: {
          create: input.levels.map((l, i) => ({
            name: l.name,
            sortOrder: l.sortOrder ?? i,
          })),
        },
      },
      include: { levels: { orderBy: { sortOrder: 'asc' } } },
    });

    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.CREATE,
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      newValues: { name: plan.name, amount: plan.amount },
    });

    return plan;
  });
}

export async function listPlans(
  tenantId: string,
  branchId: string,
  query: ListPlansQuery
) {
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { branchId };
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };
  }

  return withTenantContext(tenantId, async (tx) => {
    const [plans, total] = await Promise.all([
      tx.subscriptionPlan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { levels: true, groups: true, subscriptions: true } },
          levels: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      tx.subscriptionPlan.count({ where }),
    ]);

    return {
      plans,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });
}

export async function getPlanById(
  tenantId: string,
  branchId: string,
  planId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const plan = await tx.subscriptionPlan.findFirst({
      where: { id: planId, branchId },
      include: {
        levels: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { groups: true, subscriptions: true } },
      },
    });
    if (!plan) throw new NotFoundError('Subscription plan not found');
    return plan;
  });
}

export async function updatePlan(
  tenantId: string,
  branchId: string,
  planId: string,
  input: UpdatePlanInput,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const existing = await tx.subscriptionPlan.findFirst({
      where: { id: planId, branchId },
      select: { id: true, name: true, amount: true },
    });
    if (!existing) throw new NotFoundError('Subscription plan not found');

    // If levels are being replaced — delete-then-insert
    if (input.levels) {
      await tx.subscriptionPlanLevel.deleteMany({ where: { planId } });
    }

    const plan = await tx.subscriptionPlan.update({
      where: { id: planId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.minSessions !== undefined && { minSessions: input.minSessions }),
        ...(input.periodType !== undefined && { periodType: input.periodType }),
        ...(input.periodDays !== undefined && {
          periodDays: input.periodType === 'FROM_MONTH_START' ? null : input.periodDays,
        }),
        ...(input.freezeSessions !== undefined && { freezeSessions: input.freezeSessions }),
        ...(input.freezeRetakeDays !== undefined && { freezeRetakeDays: input.freezeRetakeDays }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.levels && {
          levels: {
            create: input.levels.map((l, i) => ({
              name: l.name,
              sortOrder: l.sortOrder ?? i,
            })),
          },
        }),
      },
      include: { levels: { orderBy: { sortOrder: 'asc' } } },
    });

    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.UPDATE,
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      newValues: { name: plan.name, amount: plan.amount },
    });

    return plan;
  });
}

export async function deactivatePlan(
  tenantId: string,
  branchId: string,
  planId: string,
  executorId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const existing = await tx.subscriptionPlan.findFirst({
      where: { id: planId, branchId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Subscription plan not found');

    await tx.subscriptionPlan.update({
      where: { id: planId },
      data: { isActive: false },
    });

    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.DELETE,
      entityType: 'SubscriptionPlan',
      entityId: planId,
      newValues: { isActive: false },
    });
  });
}

// ─── Enrollment ────────────────────────────────────────────────

/**
 * Enroll a trainee in a subscription plan + group.
 *
 * Atomically (single tx):
 *   1. Check the trainee has no ACTIVE subscription (for the message; the
 *      partial unique index is the guarantee — see the file header)
 *   2. Load plan → assert periodDays non-null if FROM_SUBSCRIPTION_DATE
 *   3. Compute startDate / endDate
 *   4. Validate the group and its plan (group.planId === plan.id)
 *   5. Create TraineeSubscription
 *   6. Place the trainee in the group (capacity, membership: placeTraineeInGroup)
 *   7. Take the next receipt number (atomic per-branch counter)
 *   8. Create Receipt
 *   9. Create FinancialTransaction INCOME record
 *  10. Audit log
 */
export async function enrollTrainee(
  tenantId: string,
  branchId: string,
  executorId: string,
  input: EnrollInput
) {
  return withTenantContext(tenantId, async (tx) => {
    await assertTraineeInBranch(tx, input.traineeId, branchId);

    // ── 1. One-active-subscription check ──────────────────────
    // Gives the common sequential case a clear message. It is NOT what prevents
    // duplicates — a concurrent request can pass this check at the same moment.
    // The partial unique index is the guarantee; insertActiveSubscription below
    // translates its rejection into the same kind of 409.
    const activeSubscription = await tx.traineeSubscription.findFirst({
      where: { traineeId: input.traineeId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (activeSubscription) {
      throw new ConflictError(
        'Trainee already has an active subscription. Close or expire the current subscription before enrolling again.'
      );
    }

    // ── 2. Load plan ──────────────────────────────────────────
    const plan = await tx.subscriptionPlan.findFirst({
      where: { id: input.planId, branchId, isActive: true },
      include: { levels: true },
    });
    if (!plan) throw new NotFoundError('Subscription plan not found or inactive');

    // ── 3. Validate level belongs to plan ─────────────────────
    const level = plan.levels.find((l) => l.id === input.levelId);
    if (!level) throw new BadRequestError('Selected level does not belong to this plan');

    // ── 4. Compute dates ──────────────────────────────────────
    const startDate = new Date();
    let endDate: Date;

    if (plan.periodType === 'FROM_SUBSCRIPTION_DATE') {
      // ⚠️ Assert non-null BEFORE addDays — null produces Invalid Date silently
      if (plan.periodDays == null) {
        throw new Error(`Plan ${plan.id} has periodType FROM_SUBSCRIPTION_DATE but missing periodDays`);
      }
      endDate = addDays(startDate, plan.periodDays);
    } else {
      // FROM_MONTH_START: 1st of current month → last day of current month
      endDate = endOfMonth(startOfMonth(startDate));
    }

    // ── 5. Load group + validate ──────────────────────────────
    const group = await tx.group.findFirst({
      where: { id: input.groupId, branchId, isActive: true },
      select: { id: true, planId: true, maxTrainees: true },
    });
    if (!group) throw new NotFoundError('Group not found or inactive');
    if (group.planId !== plan.id) {
      throw new BadRequestError('This group belongs to a different subscription plan');
    }

    // ── 6. Create subscription ────────────────────────────────
    const subscription = await insertActiveSubscription(tx, {
      traineeId: input.traineeId,
      planId: plan.id,
      levelId: level.id,
      startDate,
      endDate,
      totalSessions: plan.minSessions,
      amountPaid: input.amountPaid,
      amountDue: Number(plan.amount) - input.amountPaid,
      paymentStatus: input.paymentStatus,
    });

    // ── 7. Place in the group ─────────────────────────────────
    // A returning trainee is often still a member of this group; `create` used
    // to fail on that, so they could not re-enroll (§27).
    await placeTraineeInGroup(tx, group, input.traineeId);

    // ── 8 & 9. Generate receipt number + create receipt ───────
    const branch = await tx.branch.findUnique({
      where: { id: branchId },
      select: { code: true },
    });
    if (!branch) throw new NotFoundError('Branch not found');

    const { receiptNumber, seq } = await generateReceiptNumber(branchId, branch.code, tx);

    const receipt = await tx.receipt.create({
      data: {
        branchId,
        traineeId: input.traineeId,
        subscriptionId: subscription.id,
        receiptNumber,
        seq,
        amount: input.amountPaid,
        paymentMethod: input.paymentMethod ?? null,
        description: `Enrollment — ${plan.name} / ${level.name}`,
      },
    });

    // ── 10. Financial transaction (INCOME) ────────────────────
    await recordLedgerEntry(tx, {
      branchId,
      type: 'INCOME',
      referenceId: receipt.id,
      amount: input.amountPaid,
      date: startDate,
      description: `Subscription: ${plan.name}`,
      createdBy: executorId,
    });

    // ── 11. Audit ─────────────────────────────────────────────
    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.CREATE,
      entityType: 'TraineeSubscription',
      entityId: subscription.id,
      newValues: {
        traineeId: input.traineeId,
        planId: plan.id,
        groupId: group.id,
        receiptNumber,
        amountPaid: input.amountPaid,
      },
    });

    return { subscription, receipt };
  });
}

// ─── Renewal ──────────────────────────────────────────────────

/**
 * Renewals may be bought at any time.
 *
 *   - While the current subscription is still running, the renewal is QUEUED:
 *     stored at once with status UPCOMING, starting the day after the current
 *     one's end date. Its money is recorded the day it is paid.
 *   - Once the current one has ended (date passed or every session used), the
 *     renewal starts today and the old one is closed.
 *
 * A queued renewal becomes ACTIVE when the current one ends — by the nightly
 * expiry job, or by attendance the moment the last session is used
 * (activateUpcomingSubscription). Its group change, if any, waits until then.
 *
 * Guarantees live in the database: one ACTIVE and one UPCOMING subscription per
 * trainee (partial unique indexes). Renewal and activation also lock the
 * trainee's row first, so the two never interleave for the same trainee; the
 * checks below give the common case its clear message.
 */

/** Audit entries written by a background job, not by a person. */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

const CONCURRENT_UPCOMING_SUBSCRIPTION =
  'A renewal is already queued for this trainee — another request may have just ' +
  'created it. Refresh to see it.';

/** Serialise renewal and activation for one trainee (the row lock is held to commit). */
async function lockTrainee(tx: TransactionClient, traineeId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "trainee_profiles" WHERE "id" = ${traineeId}::uuid FOR UPDATE`;
}

/**
 * Insert a queued renewal, translating the one-UPCOMING-per-trainee index into
 * the clear 409 (the only unique rule an UPCOMING insert can hit).
 */
async function insertUpcomingSubscription(
  tx: TransactionClient,
  data: Omit<Prisma.TraineeSubscriptionUncheckedCreateInput, 'status'>
) {
  try {
    return await tx.traineeSubscription.create({ data: { ...data, status: 'UPCOMING' } });
  } catch (err) {
    if (isDuplicateActiveSubscription(err)) {
      throw new ConflictError(CONCURRENT_UPCOMING_SUBSCRIPTION);
    }
    throw err;
  }
}

/**
 * A queued renewal moving the trainee into another group must find a seat
 * there: members plus renewals already queued into it, under the group's lock.
 * The move itself happens at activation (placeTraineeInGroup checks again).
 */
async function assertSeatForQueuedMove(
  tx: TransactionClient,
  group: { id: string; maxTrainees: number },
  traineeId: string
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "groups" WHERE "id" = ${group.id}::uuid FOR UPDATE`;
  const alreadyMember = await tx.groupTrainee.findFirst({
    where: { groupId: group.id, traineeId },
    select: { id: true },
  });
  if (alreadyMember) return;

  const [members, queuedIn] = await Promise.all([
    tx.groupTrainee.count({ where: { groupId: group.id } }),
    tx.traineeSubscription.count({
      where: {
        status: 'UPCOMING',
        groupId: group.id,
        traineeId: { not: traineeId },
        trainee: { groupTrainees: { none: { groupId: group.id } } },
      },
    }),
  ]);
  if (members + queuedIn >= group.maxTrainees) {
    throw new ConflictError(
      `Group is at maximum capacity (${group.maxTrainees} trainees, counting renewals already queued into it)`
    );
  }
}

const RENEWAL_PLAN_SELECT = {
  id: true,
  name: true,
  amount: true,
  minSessions: true,
  periodType: true,
  periodDays: true,
} as const;

/**
 * Everything the renewal dialog needs: the current and any queued subscription,
 * the defaults to prefill (last plan, level and group), and — for the plan given
 * or the default one — its price and the new subscription's dates.
 */
export async function getRenewalPreview(
  tenantId: string,
  branchId: string,
  query: RenewPreviewQuery
) {
  const now = new Date();
  return withTenantContext(tenantId, async (tx) => {
    const trainee = await tx.traineeProfile.findFirst({
      where: { id: query.traineeId, branchId },
      select: {
        id: true,
        name: true,
        groupTrainees: { orderBy: { joinedAt: 'desc' }, take: 1, select: { groupId: true } },
      },
    });
    if (!trainee) throw new NotFoundError('Trainee not found');

    const [current, upcoming, last] = await Promise.all([
      tx.traineeSubscription.findFirst({
        where: { traineeId: trainee.id, status: 'ACTIVE' },
        include: { plan: { select: { name: true } }, level: { select: { name: true } } },
      }),
      tx.traineeSubscription.findFirst({
        where: { traineeId: trainee.id, status: 'UPCOMING' },
        include: {
          plan: { select: { name: true } },
          level: { select: { name: true } },
          group: { select: { id: true, name: true } },
        },
      }),
      tx.traineeSubscription.findFirst({
        where: { traineeId: trainee.id, status: { not: 'UPCOMING' } },
        orderBy: { createdAt: 'desc' },
        select: { planId: true, levelId: true, plan: { select: { isActive: true } } },
      }),
    ]);

    const defaultPlanId = last?.plan.isActive ? last.planId : null;
    const planId = query.planId ?? defaultPlanId;
    const plan = planId
      ? await tx.subscriptionPlan.findFirst({
          where: { id: planId, branchId, isActive: true },
          select: RENEWAL_PLAN_SELECT,
        })
      : null;
    if (query.planId && !plan) throw new NotFoundError('Subscription plan not found or inactive');

    const window = plan ? renewalWindow(plan, current, now) : null;

    return {
      trainee: { id: trainee.id, name: trainee.name },
      current: current && {
        id: current.id,
        planName: current.plan.name,
        levelName: current.level.name,
        startDate: current.startDate,
        endDate: current.endDate,
        attendedSessions: current.attendedSessions,
        totalSessions: current.totalSessions,
        running: isStillRunning(current, now),
      },
      upcoming: upcoming && {
        id: upcoming.id,
        planName: upcoming.plan.name,
        levelName: upcoming.level.name,
        groupName: upcoming.group?.name ?? null,
        startDate: upcoming.startDate,
        endDate: upcoming.endDate,
        amountPaid: Number(upcoming.amountPaid),
        amountDue: Number(upcoming.amountDue),
      },
      defaults: {
        planId: defaultPlanId,
        levelId: defaultPlanId ? last!.levelId : null,
        groupId: trainee.groupTrainees[0]?.groupId ?? null,
      },
      plan: plan && {
        id: plan.id,
        name: plan.name,
        amount: Number(plan.amount),
        minSessions: plan.minSessions,
      },
      startDate: window?.startDate ?? null,
      endDate: window?.endDate ?? null,
      queued: window?.queued ?? null,
    };
  });
}

/**
 * Renew a trainee's subscription. In one transaction:
 *   1. lock the trainee; refuse if a renewal is already queued;
 *   2. validate plan, level (of the plan), group (of the plan), amount ≤ price;
 *   3. work out the dates: queued after the running subscription, or from today
 *      (closing a current one that has already ended);
 *   4. seat: a queued move is checked now and made at activation; an immediate
 *      renewal is placed in its group now;
 *   5. the subscription (UPCOMING or ACTIVE), with amounts and payment status
 *      computed here, never taken from the client;
 *   6. receipt + ledger INCOME — only when money was paid;
 *   7. audit.
 */
export async function renewSubscription(
  tenantId: string,
  branchId: string,
  executorId: string,
  input: RenewInput
) {
  const now = new Date();
  return withTenantContext(tenantId, async (tx) => {
    await assertTraineeInBranch(tx, input.traineeId, branchId);
    await lockTrainee(tx, input.traineeId);

    const queuedAlready = await tx.traineeSubscription.findFirst({
      where: { traineeId: input.traineeId, status: 'UPCOMING' },
      select: { id: true },
    });
    if (queuedAlready) {
      throw new ConflictError(
        'A renewal is already queued for this trainee. Cancel it or wait until it starts before renewing again.'
      );
    }

    const plan = await tx.subscriptionPlan.findFirst({
      where: { id: input.planId, branchId, isActive: true },
      select: { ...RENEWAL_PLAN_SELECT, levels: { select: { id: true, name: true } } },
    });
    if (!plan) throw new NotFoundError('Subscription plan not found or inactive');

    const level = plan.levels.find((l) => l.id === input.levelId);
    if (!level) throw new BadRequestError('Selected level does not belong to this plan');

    const group = await tx.group.findFirst({
      where: { id: input.groupId, branchId, isActive: true },
      select: { id: true, planId: true, maxTrainees: true },
    });
    if (!group) throw new NotFoundError('Group not found or inactive');
    if (group.planId !== plan.id) {
      throw new BadRequestError('This group belongs to a different subscription plan');
    }

    const price = Number(plan.amount);
    if (input.amountPaid > price) {
      throw new BadRequestError(`Amount paid (${input.amountPaid}) is more than the plan price (${price})`);
    }

    const current = await tx.traineeSubscription.findFirst({
      where: { traineeId: input.traineeId, status: 'ACTIVE' },
      select: { id: true, status: true, endDate: true, attendedSessions: true, totalSessions: true },
    });
    const window = renewalWindow(plan, current, now);

    if (window.queued) {
      await assertSeatForQueuedMove(tx, group, input.traineeId);
    } else if (current) {
      // Ended but not yet closed (the nightly job has not run, or sessions ran
      // out): close it the way the expiry job would, so the new one can be ACTIVE.
      const endedByDate = now.getTime() >= addUtcDays(current.endDate, 1).getTime();
      await tx.traineeSubscription.update({
        where: { id: current.id },
        data: { status: 'EXPIRED', expiredAt: endedByDate ? utcDay(current.endDate) : now },
      });
    }

    const data = {
      traineeId: input.traineeId,
      planId: plan.id,
      levelId: level.id,
      groupId: group.id,
      startDate: window.startDate,
      endDate: window.endDate,
      totalSessions: plan.minSessions,
      amountPaid: input.amountPaid,
      amountDue: price - input.amountPaid,
      paymentStatus: paymentStatusFor(input.amountPaid, price),
    };
    const subscription = window.queued
      ? await insertUpcomingSubscription(tx, data)
      : await insertActiveSubscription(tx, data);

    if (!window.queued) {
      // Usually their own group: their seat is not a new one, so a member of a
      // full group can still renew into it (§27).
      await placeTraineeInGroup(tx, group, input.traineeId);
      await tx.traineeProfile.update({ where: { id: input.traineeId }, data: { levelId: level.id } });
    }

    let receipt = null;
    if (input.amountPaid > 0) {
      const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { code: true } });
      if (!branch) throw new NotFoundError('Branch not found');
      const { receiptNumber, seq } = await generateReceiptNumber(branchId, branch.code, tx);
      receipt = await tx.receipt.create({
        data: {
          branchId,
          traineeId: input.traineeId,
          subscriptionId: subscription.id,
          receiptNumber,
          seq,
          amount: input.amountPaid,
          paymentMethod: input.paymentMethod ?? null,
          description: `Renewal — ${plan.name} / ${level.name}`,
        },
      });
      await recordLedgerEntry(tx, {
        branchId,
        type: 'INCOME',
        referenceId: receipt.id,
        amount: input.amountPaid,
        date: now,
        description: `Renewal: ${plan.name}`,
        createdBy: executorId,
      });
    }

    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.CREATE,
      entityType: 'TraineeSubscription',
      entityId: subscription.id,
      newValues: {
        renewal: true,
        queued: window.queued,
        planId: plan.id,
        levelId: level.id,
        groupId: group.id,
        startDate: window.startDate,
        endDate: window.endDate,
        amountPaid: input.amountPaid,
        receiptNumber: receipt?.receiptNumber ?? null,
      },
    });

    return { subscription, receipt, queued: window.queued };
  });
}

/**
 * Start a trainee's queued renewal, inside the caller's transaction, once the
 * current subscription has ended. Returns the activated subscription, or null
 * when there is nothing to start (no renewal queued, or one is ACTIVE already).
 *
 * The caller must already have closed the old subscription. Called by:
 *   - submitAttendance, when a mark uses the last session (early start);
 *   - the nightly expiry job, for every trainee with a renewal queued and no
 *     ACTIVE subscription (activateDueRenewals).
 *
 * The renewal's level becomes the trainee's level; its group, if different, is
 * where the trainee moves. A group that filled up or was deactivated meanwhile
 * keeps the trainee where they are, and the audit entry says so.
 */
export async function activateUpcomingSubscription(
  tx: TransactionClient,
  traineeId: string,
  now: Date = new Date(),
  executorId: string = SYSTEM_USER_ID
) {
  await lockTrainee(tx, traineeId);

  const [active, upcoming] = await Promise.all([
    tx.traineeSubscription.findFirst({ where: { traineeId, status: 'ACTIVE' }, select: { id: true } }),
    tx.traineeSubscription.findFirst({
      where: { traineeId, status: 'UPCOMING' },
      include: {
        plan: { select: { periodType: true, periodDays: true } },
        trainee: { select: { branchId: true } },
      },
    }),
  ]);
  if (active || !upcoming) return null;

  const window = activationWindow(upcoming.plan, upcoming, now);
  const { count } = await tx.traineeSubscription.updateMany({
    where: { id: upcoming.id, status: 'UPCOMING' },
    data: { status: 'ACTIVE', startDate: window.startDate, endDate: window.endDate },
  });
  if (count !== 1) return null;

  await tx.traineeProfile.update({ where: { id: traineeId }, data: { levelId: upcoming.levelId } });

  let groupNote: string | null = null;
  if (upcoming.groupId) {
    const group = await tx.group.findFirst({
      where: { id: upcoming.groupId, isActive: true },
      select: { id: true, maxTrainees: true },
    });
    if (!group) {
      groupNote = 'renewal group is no longer active; trainee kept in their current group';
    } else {
      try {
        await placeTraineeInGroup(tx, group, traineeId);
      } catch (err) {
        // A ConflictError is thrown before any SQL fails, so the transaction is intact.
        if (!(err instanceof ConflictError)) throw err;
        groupNote = 'renewal group is full; trainee kept in their current group';
      }
    }
  }

  await writeAuditLog(tx, {
    userId: executorId,
    branchId: upcoming.trainee.branchId,
    action: AuditAction.STATUS_CHANGE,
    entityType: 'TraineeSubscription',
    entityId: upcoming.id,
    oldValues: { status: 'UPCOMING', startDate: upcoming.startDate, endDate: upcoming.endDate },
    newValues: {
      status: 'ACTIVE',
      startDate: window.startDate,
      endDate: window.endDate,
      ...(groupNote ? { note: groupNote } : {}),
    },
  });

  return tx.traineeSubscription.findUnique({ where: { id: upcoming.id } });
}

/**
 * Nightly: start every queued renewal whose trainee has no ACTIVE subscription
 * (the expiry job has just closed the ones that ended). Also heals a renewal
 * left queued by a race with attendance. Returns how many were started.
 */
export async function activateDueRenewals(tx: TransactionClient, now: Date = new Date()): Promise<number> {
  const due = await tx.traineeSubscription.findMany({
    where: {
      status: 'UPCOMING',
      trainee: { subscriptions: { none: { status: 'ACTIVE' } } },
    },
    select: { traineeId: true },
  });
  let started = 0;
  for (const { traineeId } of due) {
    if (await activateUpcomingSubscription(tx, traineeId, now)) started++;
  }
  return started;
}

/**
 * Cancel a queued renewal that nothing has been paid on. Admin only (route).
 * Money already paid stays recorded: a renewal with receipts cannot be
 * cancelled here — refunding it is a separate, deliberate step.
 */
export async function cancelUpcomingRenewal(
  tenantId: string,
  branchId: string,
  executorId: string,
  subscriptionId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const sub = await tx.traineeSubscription.findFirst({
      where: { id: subscriptionId, trainee: { branchId } },
      select: {
        id: true,
        traineeId: true,
        status: true,
        planId: true,
        startDate: true,
        amountPaid: true,
        _count: { select: { receipts: true } },
      },
    });
    if (!sub) throw new NotFoundError('Subscription not found');
    await lockTrainee(tx, sub.traineeId);

    if (sub.status !== 'UPCOMING') {
      throw new ConflictError('Only a queued renewal that has not started yet can be cancelled');
    }
    if (Number(sub.amountPaid) > 0 || sub._count.receipts > 0) {
      throw new ConflictError(
        'Money has already been paid on this renewal, so it cannot be cancelled here'
      );
    }

    await tx.traineeSubscription.delete({ where: { id: sub.id } });
    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.DELETE,
      entityType: 'TraineeSubscription',
      entityId: sub.id,
      oldValues: { status: 'UPCOMING', planId: sub.planId, startDate: sub.startDate },
    });
    return { cancelled: true };
  });
}

// ─── Partial Payment ────────────────────────────────────────────

/**
 * Record a partial (or final) payment against an existing subscription.
 * Generates a receipt + INCOME transaction for the payment amount.
 *
 * ⚠️ The overpayment check and the balance update run in the SAME tx.
 *    Two concurrent payment requests against the same subscription must
 *    not both read the same amountDue, both pass the check, and both
 *    commit — that would drive amountDue negative.
 *
 * ⚠️ TraineeSubscription has no direct branchId column — branch scope
 *    goes through the trainee relation.
 */
export async function recordPayment(
  tenantId: string,
  branchId: string,
  executorId: string,
  subscriptionId: string,
  amount: number,
  paymentMethod: RecordPaymentInput['paymentMethod']
) {
  return withTenantContext(tenantId, async (tx) => {
    const subscription = await tx.traineeSubscription.findFirst({
      where: { id: subscriptionId, trainee: { branchId } },
      include: {
        plan: { select: { name: true } },
        level: { select: { name: true } },
      },
    });
    if (!subscription) throw new NotFoundError('Subscription not found');

    const currentAmountDue = Number(subscription.amountDue);
    if (amount > currentAmountDue) {
      throw new BadRequestError(
        `Payment of ${amount} exceeds the outstanding balance of ${currentAmountDue}`
      );
    }

    const newAmountPaid = Number(subscription.amountPaid) + amount;
    const newAmountDue = currentAmountDue - amount;
    const newPaymentStatus = newAmountDue <= 0 ? 'PAID' : 'PARTIAL';

    const updated = await tx.traineeSubscription.update({
      where: { id: subscription.id },
      data: {
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        paymentStatus: newPaymentStatus,
      },
    });

    const branch = await tx.branch.findUnique({
      where: { id: branchId },
      select: { code: true },
    });
    if (!branch) throw new NotFoundError('Branch not found');

    const { receiptNumber, seq } = await generateReceiptNumber(branchId, branch.code, tx);

    const receipt = await tx.receipt.create({
      data: {
        branchId,
        traineeId: subscription.traineeId,
        subscriptionId: subscription.id,
        receiptNumber,
        seq,
        amount,
        paymentMethod,
        description: `Partial payment — ${subscription.plan.name} / ${subscription.level.name}`,
      },
    });

    await recordLedgerEntry(tx, {
      branchId,
      type: 'INCOME',
      referenceId: receipt.id,
      amount,
      date: new Date(),
      description: `Payment: ${subscription.plan.name}`,
      createdBy: executorId,
    });

    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.UPDATE,
      entityType: 'TraineeSubscription',
      entityId: subscription.id,
      oldValues: {
        amountPaid: subscription.amountPaid,
        amountDue: subscription.amountDue,
        paymentStatus: subscription.paymentStatus,
      },
      newValues: {
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        paymentStatus: newPaymentStatus,
        receiptNumber,
      },
    });

    return { subscription: updated, receipt };
  });
}
