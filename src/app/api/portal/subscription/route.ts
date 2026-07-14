/**
 * GET /api/portal/subscription — trainee's own active subscription status
 *
 * Trainee-only, self-scoped.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withTraineeAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getPortalSubscription } from '@/services/portal.service';

export const GET = withErrorHandler(
  withTraineeAuth(async (request, ctx) => {
    const traineeId = new URL(request.url).searchParams.get('traineeId') ?? undefined;
    const result = await getPortalSubscription(ctx.tenantId, ctx.branchId, ctx.userId, traineeId);
    return successResponse(result);
  })
);
