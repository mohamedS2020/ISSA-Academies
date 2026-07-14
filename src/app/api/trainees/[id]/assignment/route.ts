/**
 * PATCH /api/trainees/[id]/assignment — change an enrolled trainee's LEVEL
 * and/or GROUP within their active subscription's plan.
 *
 * Admin, or Moderator with `can_manage_trainees`.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { updateAssignmentSchema } from '@/schemas/trainee.schema';
import { updateTraineeAssignment } from '@/services/trainee.service';
import { requirePrivilege, requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_manage_trainees');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

    const { id } = await routeCtx!.params;
    const body = await request.json();
    const input = updateAssignmentSchema.parse(body);

    const result = await updateTraineeAssignment(
      ctx.tenantId,
      ctx.branchId,
      id,
      input,
      ctx.userId
    );

    return successResponse(result);
  })
);
