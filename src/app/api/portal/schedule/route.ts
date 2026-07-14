/**
 * GET /api/portal/schedule — trainee's own upcoming sessions
 *
 * Trainee-only, self-scoped. ?dateFrom=&dateTo=&page=&limit=
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withTraineeAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getPortalSchedule } from '@/services/portal.service';

export const GET = withErrorHandler(
  withTraineeAuth(async (request, ctx) => {
    const sp = new URL(request.url).searchParams;

    const result = await getPortalSchedule(ctx.tenantId, ctx.branchId, ctx.userId, {
      dateFrom: sp.get('dateFrom') ?? undefined,
      dateTo: sp.get('dateTo') ?? undefined,
      page: sp.get('page') ? Number(sp.get('page')) : undefined,
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
    }, sp.get('traineeId') ?? undefined);

    return successResponse(result.data, result.pagination);
  })
);
