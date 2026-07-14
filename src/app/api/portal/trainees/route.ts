/**
 * GET /api/portal/trainees — the trainees managed by the logged-in account
 * (a guardian with one or more children). Powers the portal trainee switcher.
 *
 * Trainee-only, self-scoped: always the caller's own account's trainees.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withTraineeAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getOwnTrainees } from '@/services/portal.service';

export const GET = withErrorHandler(
  withTraineeAuth(async (request, ctx) => {
    const trainees = await getOwnTrainees(ctx.tenantId, ctx.branchId, ctx.userId);
    return successResponse(trainees);
  })
);
