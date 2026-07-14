/**
 * GET /api/portal/receipts — trainee's own receipts list
 *
 * Trainee-only, self-scoped. ?page=&limit=&startDate=&endDate=
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withTraineeAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getPortalReceipts } from '@/services/portal.service';

export const GET = withErrorHandler(
  withTraineeAuth(async (request, ctx) => {
    const sp = new URL(request.url).searchParams;

    const result = await getPortalReceipts(ctx.tenantId, ctx.branchId, ctx.userId, {
      page: sp.get('page') ? Number(sp.get('page')) : undefined,
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
      startDate: sp.get('startDate') ?? undefined,
      endDate: sp.get('endDate') ?? undefined,
    }, sp.get('traineeId') ?? undefined);

    return successResponse(result.receipts, result.pagination);
  })
);
