/**
 * GET  /api/portal/captain-rating — the trainee's captain + their own stars
 * PUT  /api/portal/captain-rating — trainee sets/updates their star rating
 *
 * Trainee-only, self-scoped. `?traineeId=` selects which of the account's
 * children (defaults to the first) — always validated via resolveOwnTrainee.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withTraineeAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { resolveOwnTrainee } from '@/services/portal.service';
import { getOwnCaptainRating, rateOwnCaptain } from '@/services/rating.service';
import { rateCaptainSchema } from '@/schemas/rating-feedback.schema';

export const GET = withErrorHandler(
  withTraineeAuth(async (request, ctx) => {
    const requested = new URL(request.url).searchParams.get('traineeId') ?? undefined;
    const traineeId = await resolveOwnTrainee(ctx.tenantId, ctx.branchId, ctx.userId, requested);
    const data = await getOwnCaptainRating(ctx.tenantId, ctx.branchId, traineeId);
    return successResponse(data);
  })
);

export const PUT = withErrorHandler(
  withTraineeAuth(async (request, ctx) => {
    const requested = new URL(request.url).searchParams.get('traineeId') ?? undefined;
    const traineeId = await resolveOwnTrainee(ctx.tenantId, ctx.branchId, ctx.userId, requested);
    const { stars } = rateCaptainSchema.parse(await request.json());
    const data = await rateOwnCaptain(ctx.tenantId, ctx.branchId, traineeId, stars);
    return successResponse(data);
  })
);
