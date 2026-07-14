/**
 * ISSA — Receipt Service
 *
 * Handles sequential receipt number generation and receipt CRUD.
 *
 * ⚠️  generateReceiptNumber MUST be called with the caller's tx object.
 *     The MAX(seq) query and the INSERT must be in the same transaction
 *     to prevent duplicate numbers under concurrent enrollment.
 *
 * Receipt number format: REC-{BRANCHCODE}-{6-digit padded seq}
 * e.g. REC-BR01-000001
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
 * Generate the next sequential receipt number for a branch.
 *
 * ⚠️  Must be called INSIDE the same withTenantContext tx as the receipt INSERT.
 *     Running outside the tx creates a race condition.
 */
export async function generateReceiptNumber(
  branchId: string,
  branchCode: string,
  tx: TxClient
): Promise<{ receiptNumber: string; seq: number }> {
  // Find the highest existing seq for this branch — within the transaction
  const last = await tx.receipt.findFirst({
    where: { branchId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  });

  const seq = (last?.seq ?? 0) + 1;
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
