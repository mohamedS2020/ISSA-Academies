/**
 * Receipt Service
 *
 * Handles sequential receipt number generation and receipt CRUD.
 *
 * Receipt number format: REC-{BRANCHCODE}-{6-digit padded seq}
 * e.g. REC-BR01-000001
 *
 * ⚠️ generateReceiptNumber MUST be called with the caller's tx object, so the
 *    counter increment commits or rolls back with the receipt it numbers.
 *
 * This file used to claim that running the MAX(seq) read and the INSERT "in the
 * same transaction" prevented duplicate numbers. It did not: a transaction does
 * not lock rows it only reads, so concurrent enrollments read the same maximum
 * and 4 of 6 simultaneous ones failed on the duplicate. See generateReceiptNumber.
 */

import { withTenantContext } from '@/lib/db/tenant-client';
import { NotFoundError } from '@/lib/api/error-handler';

// ─── Types ────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof withTenantContext>[1]>[0];

export interface ReceiptListQuery {
  page?: number;
  limit?: number;
  traineeId?: string;
  startDate?: string;
  endDate?: string;
}

// ─── Generate Receipt Number ──────────────────────────────────

/**
 * Take the next receipt number for a branch.
 *
 * Increments `branches.receipt_seq` atomically. The UPDATE takes a row lock on
 * the branch, so concurrent enrollments serialize here and each gets a distinct
 * number; the lock is released at commit. Because the increment is part of the
 * caller's transaction, a rolled-back enrollment rolls the number back too — the
 * sequence stays gap-free.
 *
 * Call it as LATE as possible in the transaction: everything after it runs while
 * holding the branch lock, and holding it longer serializes more of the work.
 *
 * The counter only ever increases. Never derive the next number from existing
 * receipts — the archive job moves old receipts out of this table, so MAX(seq)
 * would drop and numbers would be reused.
 */
export async function generateReceiptNumber(
  branchId: string,
  branchCode: string,
  tx: TxClient
): Promise<{ receiptNumber: string; seq: number }> {
  const [row] = await tx.$queryRaw<{ receipt_seq: number }[]>`
    UPDATE "branches"
    SET "receipt_seq" = "receipt_seq" + 1
    WHERE "id" = ${branchId}::uuid
    RETURNING "receipt_seq"
  `;
  if (!row) throw new NotFoundError('Branch not found');

  const seq = row.receipt_seq;
  const receiptNumber = `REC-${branchCode.toUpperCase()}-${String(seq).padStart(6, '0')}`;
  return { receiptNumber, seq };
}

// ─── List Receipts ────────────────────────────────────────────

export async function listReceipts(
  tenantId: string,
  branchId: string,
  query: ReceiptListQuery
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { branchId };
  if (query.traineeId) where.traineeId = query.traineeId;
  if (query.startDate || query.endDate) {
    where.issuedAt = {
      ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
      ...(query.endDate ? { lte: new Date(query.endDate + 'T23:59:59Z') } : {}),
    };
  }

  return withTenantContext(tenantId, async (tx) => {
    const [receipts, total] = await Promise.all([
      tx.receipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issuedAt: 'desc' },
        include: {
          trainee: {
            select: {
              name: true,
              systemCode: true,
              user: { select: { name: true } },
            },
          },
          subscription: {
            select: {
              plan: { select: { name: true } },
              level: { select: { name: true } },
            },
          },
          branch: { select: { code: true, name: true } },
        },
      }),
      tx.receipt.count({ where }),
    ]);

    return {
      receipts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });
}

// ─── Get Receipt By ID ────────────────────────────────────────

export async function getReceiptById(
  tenantId: string,
  branchId: string,
  receiptId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const receipt = await tx.receipt.findFirst({
      where: { id: receiptId, branchId },
      include: {
        trainee: {
          select: {
            name: true,
            systemCode: true,
            user: { select: { name: true, phoneNumber: true } },
          },
        },
        subscription: {
          select: {
            plan: { select: { name: true, amount: true } },
            level: { select: { name: true } },
            startDate: true,
            endDate: true,
            paymentStatus: true,
            amountPaid: true,
            amountDue: true,
          },
        },
        branch: { select: { name: true, code: true } },
      },
    });

    if (!receipt) throw new NotFoundError('Receipt not found');
    return receipt;
  });
}
