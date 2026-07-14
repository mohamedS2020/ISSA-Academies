/**
 * GET  /api/trainees/[id]/feedback — captain feedback history for a trainee
 *        · ADMIN / MODERATOR → any trainee in the branch
 *        · CAPTAIN           → only their own trainees (else 403)
 * POST /api/trainees/[id]/feedback — CAPTAIN writes a feedback entry on their trainee
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { requireRole, requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';
import { createFeedbackSchema } from '@/schemas/rating-feedback.schema';
import {
  addCaptainFeedback,
  listCaptainFeedback,
  listCaptainFeedbackForOwnTrainee,
} from '@/services/feedback.service';

export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    const { id } = await routeCtx!.params;

    // Captains see feedback only for trainees in their own groups.
    if (ctx.role === UserRole.CAPTAIN) {
      const data = await listCaptainFeedbackForOwnTrainee(
        ctx.tenantId,
        ctx.branchId,
        ctx.userId,
        id
      );
      return successResponse(data);
    }

    requireMinRole(ctx, UserRole.MODERATOR);
    const data = await listCaptainFeedback(ctx.tenantId, ctx.branchId, id);
    return successResponse(data);
  })
);

export const POST = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    requireRole(ctx, UserRole.CAPTAIN);
    const { id } = await routeCtx!.params;
    const { message } = createFeedbackSchema.parse(await request.json());
    const data = await addCaptainFeedback(ctx.tenantId, ctx.branchId, ctx.userId, id, message);
    return successResponse(data, undefined, 201);
  })
);
