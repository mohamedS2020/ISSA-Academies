/**
 * PATCH  /api/evaluations/[id] — update an evaluation
 * DELETE /api/evaluations/[id] — delete an evaluation
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { updateEvaluationSchema } from '@/schemas/attendance.schema';
import { updateEvaluation, deleteEvaluation } from '@/services/attendance.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.CAPTAIN);

    const id = (await routeContext!.params).id as string;
    const body = await request.json();
    const { notes } = updateEvaluationSchema.parse(body);

    const updated = await updateEvaluation(ctx.tenantId, id, ctx.userId, notes);
    return successResponse(updated);
  })
);

export const DELETE = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.CAPTAIN);

    const id = (await routeContext!.params).id as string;
    await deleteEvaluation(ctx.tenantId, id, ctx.userId);
    return successResponse({ deleted: true });
  })
);
