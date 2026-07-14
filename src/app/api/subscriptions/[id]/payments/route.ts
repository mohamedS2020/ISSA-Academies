/**
 * POST /api/subscriptions/[id]/payments — record a partial/final payment
 *
 * Generates a receipt + INCOME transaction for the payment amount and
 * recomputes amountPaid/amountDue/paymentStatus. Overpayment is rejected.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { createdResponse } from '@/lib/api/response';
import { recordPaymentSchema } from '@/schemas/finance.schema';
import { recordPayment } from '@/services/subscription.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const POST = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.MODERATOR);

    const { id } = await routeContext!.params;
    const body = await request.json();
    const input = recordPaymentSchema.parse(body);

    const result = await recordPayment(
      ctx.tenantId,
      ctx.branchId,
      ctx.userId,
      id,
      input.amount,
      input.paymentMethod
    );

    return createdResponse(result);
  })
);
