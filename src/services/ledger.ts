/**
 * Financial ledger
 *
 * `financial_transactions` is the ledger the P&L and dashboard totals sum. Each
 * financial SOURCE — an expense, a manual income, a receipt, a paid payroll — is
 * mirrored into it as exactly ONE row, linked by `referenceId`.
 *
 * This module is the only thing that writes those mirrors.
 *
 * ⚠️ WHY IT EXISTS. Each service used to maintain its own mirror by hand, and one
 * forgot: `updateExpense` changed the expense and never touched the ledger, so an
 * edited expense kept showing its old amount and month in every report while the
 * expenses page showed the new ones (hardening plan §24). `updateManualIncome`
 * had the sync; `updateExpense` never got it. A rule maintained per function
 * drifts. Maintained here, it cannot.
 *
 * Every function takes the caller's transaction client, so a source write and
 * its mirror commit or roll back together — there is no window in which the
 * books disagree.
 */

import type { Prisma, TransactionClient } from '@/lib/db/tenant-client';

export type LedgerType = 'INCOME' | 'EXPENSE';

/** Identifies one mirrored ledger row. */
export interface LedgerRef {
  branchId: string;
  type: LedgerType;
  /** Id of the source row: the expense, manual income, receipt or payroll. */
  referenceId: string;
}

export interface NewLedgerEntry extends LedgerRef {
  amount: Prisma.Decimal | number;
  date: Date;
  description: string;
  createdBy: string;
}

export interface LedgerChanges {
  amount?: Prisma.Decimal | number;
  date?: Date;
  description?: string;
}

/**
 * Thrown when a source row has no ledger mirror — or more than one — at the
 * moment it is being edited. Either means the P&L is already wrong.
 */
export class LedgerIntegrityError extends Error {
  constructor(ref: LedgerRef, found: number) {
    super(
      `Ledger integrity: expected exactly one ${ref.type} entry for ${ref.referenceId} ` +
        `in branch ${ref.branchId}, found ${found}. The P&L does not match its source.`
    );
    this.name = 'LedgerIntegrityError';
  }
}

/** Mirror a new financial source into the ledger. */
export async function recordLedgerEntry(
  tx: TransactionClient,
  entry: NewLedgerEntry
): Promise<void> {
  await tx.financialTransaction.create({
    data: {
      branchId: entry.branchId,
      type: entry.type,
      referenceId: entry.referenceId,
      amount: entry.amount,
      date: entry.date,
      description: entry.description,
      createdBy: entry.createdBy,
    },
  });
}

/**
 * Propagate an edit to a source row into its ledger mirror.
 *
 * STRICT: exactly one mirror must match. An update that matches none means the
 * ledger was already out of step with its source, and this edit would leave it
 * out of step too — the precise failure this module exists to prevent. Failing
 * the whole transaction is correct: better to refuse an edit than to accept one
 * we know leaves the books wrong.
 *
 * A no-op when nothing ledger-relevant changed, so callers can pass their
 * partial input straight through.
 */
export async function updateLedgerEntry(
  tx: TransactionClient,
  ref: LedgerRef,
  changes: LedgerChanges
): Promise<void> {
  const data: LedgerChanges = {};
  if (changes.amount !== undefined) data.amount = changes.amount;
  if (changes.date !== undefined) data.date = changes.date;
  if (changes.description !== undefined) data.description = changes.description;
  if (Object.keys(data).length === 0) return;

  const { count } = await tx.financialTransaction.updateMany({
    where: { branchId: ref.branchId, type: ref.type, referenceId: ref.referenceId },
    data,
  });

  if (count !== 1) throw new LedgerIntegrityError(ref, count);
}

/**
 * Remove a source row's ledger mirror.
 *
 * LENIENT, unlike `updateLedgerEntry`: removing a mirror that is already gone
 * leaves the P&L correct — there is nothing left to be wrong — so refusing the
 * delete would only block the user for no benefit.
 */
export async function removeLedgerEntry(
  tx: TransactionClient,
  ref: LedgerRef
): Promise<void> {
  await tx.financialTransaction.deleteMany({
    where: { branchId: ref.branchId, type: ref.type, referenceId: ref.referenceId },
  });
}
