/**
 * GET /api/portal/attendance — trainee's own attendance history
 *
 * Trainee-only, self-scoped. ?page=&limit=
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withTraineeAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getPortalAttendance } from '@/services/portal.service';

export const GET = withErrorHandler(
  withTraineeAuth(async (request, ctx) => {
    const sp = new URL(request.url).searchParams;
    const page = sp.get('page') ? Number(sp.get('page')) : 1;
    const limit = sp.get('limit') ? Number(sp.get('limit')) : 20;

    const result = await getPortalAttendance(ctx.tenantId, ctx.branchId, ctx.userId, page, limit, sp.get('traineeId') ?? undefined);
    return successResponse(result.data, result.pagination);
  })
);
