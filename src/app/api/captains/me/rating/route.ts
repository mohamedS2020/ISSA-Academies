/**
 * GET /api/captains/me/rating — the logged-in captain's own cumulative rating
 *
 * Powers the rating badge beside the captain's name in the dashboard header.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';
import { getOwnRatingSummary } from '@/services/rating.service';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireRole(ctx, UserRole.CAPTAIN);
    const data = await getOwnRatingSummary(ctx.tenantId, ctx.branchId, ctx.userId);
    return successResponse(data);
  })
);
