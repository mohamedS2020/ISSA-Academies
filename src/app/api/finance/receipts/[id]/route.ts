/**
 * GET /api/finance/receipts/[id] — single receipt detail
 * GET /api/finance/receipts/[id]?format=pdf — download as PDF
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getReceiptById } from '@/services/receipt.service';
import { exportReceiptToPdf } from '@/services/export.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.MODERATOR);
    const { id } = await routeContext!.params;
    const receipt = await getReceiptById(ctx.tenantId, ctx.branchId, id);

    const format = new URL(request.url).searchParams.get('format');
    if (format === 'pdf') {
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
    }

    return successResponse(receipt);
  })
);
