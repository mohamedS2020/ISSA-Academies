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
import { requireAccess } from '@/lib/auth/permissions';

export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    requireAccess(ctx, 'manageTrainees');

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
