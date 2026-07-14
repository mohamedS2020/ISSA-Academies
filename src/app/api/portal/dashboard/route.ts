/**
 * GET /api/portal/dashboard — trainee's own dashboard summary
 *
 * Trainee-only, self-scoped (FR-TP-06: read-only).
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withTraineeAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getPortalDashboard } from '@/services/portal.service';

export const GET = withErrorHandler(
  withTraineeAuth(async (request, ctx) => {
    const traineeId = new URL(request.url).searchParams.get('traineeId') ?? undefined;
    const dashboard = await getPortalDashboard(ctx.tenantId, ctx.branchId, ctx.userId, traineeId);
    return successResponse(dashboard);
  })
);
