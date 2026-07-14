/**
 * GET  /api/schedule/[id] — get session detail
 * PATCH /api/schedule/[id] — reschedule a session
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { rescheduleSessionSchema } from '@/schemas/schedule.schema';
import { getSessionById, rescheduleSession } from '@/services/schedule.service';
import { getBranchTimezone } from '@/services/branch.service';
import { toUTC } from '@/lib/utils/timezone';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.CAPTAIN);

    const id = (await routeContext!.params).id as string;
    const session = await getSessionById(ctx.tenantId, ctx.branchId, id);
    return successResponse(session);
  })
);

export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.MODERATOR);

    const id = (await routeContext!.params).id as string;
    const body = await request.json();
    const { date, time } = rescheduleSessionSchema.parse(body);

    // Convert the branch-local wall-clock time to UTC (DST-safe) before storing.
    const timezone = await getBranchTimezone(ctx.tenantId, ctx.branchId);
    const newScheduledAt = toUTC(time, date, timezone);

    const updated = await rescheduleSession(
      ctx.tenantId,
      ctx.branchId,
      id,
      newScheduledAt,
      ctx.userId
    );

    return successResponse(updated);
  })
);
