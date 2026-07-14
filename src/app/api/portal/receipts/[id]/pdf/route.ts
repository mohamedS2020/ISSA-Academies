/**
 * GET /api/portal/receipts/[id]/pdf — download own receipt as PDF
 *
 * Trainee-only, ownership-checked (404 if the receipt belongs to someone
 * else — not 403, to avoid confirming the receipt's existence).
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withTraineeAuth } from '@/lib/auth/middleware';
import { getOwnReceiptForDownload } from '@/services/portal.service';
import { exportReceiptToPdf } from '@/services/export.service';

export const GET = withErrorHandler(
  withTraineeAuth(async (request, ctx, routeContext) => {
    const { id } = await routeContext!.params;
    const receipt = await getOwnReceiptForDownload(
      ctx.tenantId,
      ctx.branchId,
      ctx.userId,
      id
    );

    const buffer = await exportReceiptToPdf({
      receiptNumber: receipt.receiptNumber,
      amount: Number(receipt.amount),
      paymentMethod: receipt.paymentMethod,
      description: receipt.description,
      issuedAt: receipt.issuedAt,
      branch: receipt.branch,
      trainee: receipt.trainee,
      subscription: {
        plan: receipt.subscription.plan,
        level: receipt.subscription.level,
        paymentStatus: receipt.subscription.paymentStatus,
        amountPaid: Number(receipt.subscription.amountPaid),
        amountDue: Number(receipt.subscription.amountDue),
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${receipt.receiptNumber}.pdf"`,
      },
    });
  })
);
