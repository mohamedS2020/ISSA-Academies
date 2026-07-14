/**
 * DELETE /api/groups/[id]/trainees/[traineeId]
 * Remove a trainee from a group.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { removeTraineeFromGroup } from '@/services/group.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const DELETE = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.ADMIN);
    const { id, traineeId } = await routeContext!.params;
    await removeTraineeFromGroup(ctx.tenantId, ctx.branchId, id, traineeId, ctx.userId);
    return successResponse({ removed: true });
  })
);
