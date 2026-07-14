/**
 * GET /api/portal/feedback — captain feedback for the trainee (newest first)
 *
 * Trainee-only, self-scoped. `?traineeId=` selects which child (validated).
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withTraineeAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { resolveOwnTrainee } from '@/services/portal.service';
import { listCaptainFeedback } from '@/services/feedback.service';

export const GET = withErrorHandler(
  withTraineeAuth(async (request, ctx) => {
    const requested = new URL(request.url).searchParams.get('traineeId') ?? undefined;
    const traineeId = await resolveOwnTrainee(ctx.tenantId, ctx.branchId, ctx.userId, requested);
    const data = await listCaptainFeedback(ctx.tenantId, ctx.branchId, traineeId);
    return successResponse(data);
  })
);
