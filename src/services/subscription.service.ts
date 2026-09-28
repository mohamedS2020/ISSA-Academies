/**
 * Subscription Service
 *
 * Handles subscription plan CRUD, trainee enrollment, and renewal.
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
import { recordLedgerEntry } from './ledger';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '@/lib/api/error-handler';
import { AuditAction } from '@/types';
import type {
  CreatePlanInput,
  UpdatePlanInput,
  ListPlansQuery,
  EnrollInput,
  RenewInput,
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
 *   1. Assert trainee has no ACTIVE subscription (inside tx — race-safe)
 *   2. Load plan → assert periodDays non-null if FROM_SUBSCRIPTION_DATE
 *   3. Compute startDate / endDate
 *   4. Validate group capacity
 *   5. Validate plan match (group.planId === plan.id)
 *   6. Create TraineeSubscription
 *   7. Create GroupTrainee
 *   8. Generate sequential receipt number (MAX+1 inside tx)
 *   9. Create Receipt
 *  10. Create FinancialTransaction INCOME record
 *  11. Audit log
 */
export async function enrollTrainee(
  tenantId: string,
  branchId: string,
  executorId: string,
  input: EnrollInput
) {
  return withTenantContext(tenantId, async (tx) => {
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
      include: { _count: { select: { trainees: true } } },
    });
    if (!group) throw new NotFoundError('Group not found or inactive');
    if (group.planId !== plan.id) {
      throw new BadRequestError('This group belongs to a different subscription plan');
    }
    if (group._count.trainees >= group.maxTrainees) {
      throw new ConflictError(`Group is at maximum capacity (${group.maxTrainees} trainees)`);
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

    // ── 7. Assign to group ────────────────────────────────────
    await tx.groupTrainee.create({
      data: { groupId: group.id, traineeId: input.traineeId },
    });

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
 * Manually renew a trainee's subscription.
 * Closes the current subscription (any status) → creates a new one → generates receipt.
 * All in one atomic tx.
 */
export async function renewSubscription(
  tenantId: string,
  branchId: string,
  executorId: string,
  input: RenewInput
) {
  return withTenantContext(tenantId, async (tx) => {
    // Close any existing subscription for this trainee
    await tx.traineeSubscription.updateMany({
      where: { traineeId: input.traineeId, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });

    // Reuse enrollTrainee logic via direct tx operations
    const plan = await tx.subscriptionPlan.findFirst({
      where: { id: input.planId, branchId, isActive: true },
      include: { levels: true },
    });
    if (!plan) throw new NotFoundError('Subscription plan not found or inactive');

    const level = plan.levels.find((l) => l.id === input.levelId);
    if (!level) throw new BadRequestError('Selected level does not belong to this plan');

    const startDate = new Date();
    let endDate: Date;

    if (plan.periodType === 'FROM_SUBSCRIPTION_DATE') {
      if (plan.periodDays == null) {
        throw new Error(`Plan ${plan.id} missing periodDays`);
      }
      endDate = addDays(startDate, plan.periodDays);
    } else {
      endDate = endOfMonth(startOfMonth(startDate));
    }

    const group = await tx.group.findFirst({
      where: { id: input.groupId, branchId, isActive: true },
      include: { _count: { select: { trainees: true } } },
    });
    if (!group) throw new NotFoundError('Group not found or inactive');
    if (group.planId !== plan.id) {
      throw new BadRequestError('Group belongs to a different plan');
    }
    if (group._count.trainees >= group.maxTrainees) {
      throw new ConflictError(`Group is at maximum capacity`);
    }

    // Concurrent renewals both expire the old subscription and both reach this
    // insert; the partial unique index lets exactly one through, and the other
    // gets a clear 409 rather than creating a second ACTIVE subscription.
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

    // Re-assign to group (may already be in group — upsert-style)
    await tx.groupTrainee.upsert({
      where: { groupId_traineeId: { groupId: group.id, traineeId: input.traineeId } },
      create: { groupId: group.id, traineeId: input.traineeId },
      update: {},
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
      date: startDate,
      description: `Renewal: ${plan.name}`,
      createdBy: executorId,
    });

    await writeAuditLog(tx, {
      userId: executorId,
      branchId,
      action: AuditAction.UPDATE,
      entityType: 'TraineeSubscription',
      entityId: subscription.id,
      newValues: { renewal: true, planId: plan.id, receiptNumber },
    });

    return { subscription, receipt };
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
