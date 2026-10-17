/**
 * POST /api/schedule/[id]/cancel — cancel a session
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { cancelSessionSchema } from '@/schemas/schedule.schema';
import { cancelSession } from '@/services/schedule.service';
import { requireAccess } from '@/lib/auth/permissions';

export const POST = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireAccess(ctx, 'manageSchedule');

    const id = (await routeContext!.params).id as string;
    const body = await request.json();
    const { reason } = cancelSessionSchema.parse(body);

    const updated = await cancelSession(
      ctx.tenantId,
      ctx.branchId,
      id,
      reason,
      ctx.userId
    );

    return successResponse(updated);
  })
);
