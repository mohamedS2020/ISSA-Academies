/**
 * DELETE /api/subscriptions/[id] — cancel a queued (UPCOMING) renewal.
 *
 * Admin only, and only while nothing has been paid on it: money already
 * recorded stays recorded. Any other subscription is refused (409).
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { cancelUpcomingRenewal } from '@/services/subscription.service';
import { requireAccess } from '@/lib/auth/permissions';
import { z } from 'zod';

export const DELETE = withErrorHandler(
  withAuth(async (_request, ctx, routeContext) => {
    requireAccess(ctx, 'cancelRenewal');

    const { id } = await routeContext!.params;
    const subscriptionId = z.string().uuid().parse(id);
    const result = await cancelUpcomingRenewal(ctx.tenantId, ctx.branchId, ctx.userId, subscriptionId);

    return successResponse(result);
  })
);
