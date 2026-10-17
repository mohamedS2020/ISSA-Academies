import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { updateTraineeSchema } from '@/schemas/trainee.schema';
import {
  getTraineeById,
  updateTrainee,
  deactivateTrainee,
  activateTrainee,
} from '@/services/trainee.service';
import { requireAccess } from '@/lib/auth/permissions';

// ─── GET — Get Trainee By ID ──────────────────────────────────
export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    requireAccess(ctx, 'viewTrainees');

    const { id } = await routeCtx!.params;
    const trainee = await getTraineeById(ctx.tenantId, ctx.branchId, id);

    return successResponse(trainee);
  })
);

// ─── PATCH — Update Trainee / Deactivate ─────────────────────
export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    requireAccess(ctx, 'manageTrainees');

    const { id } = await routeCtx!.params;
    const body = await request.json();

    if (body.action === 'deactivate') {
      const result = await deactivateTrainee(
        ctx.tenantId,
        ctx.branchId,
        id,
        ctx.userId
      );
      return successResponse(result);
    }

    if (body.action === 'activate') {
      const result = await activateTrainee(ctx.tenantId, ctx.branchId, id, ctx.userId);
      return successResponse(result);
    }

    const input = updateTraineeSchema.parse(body);
    const updated = await updateTrainee(
      ctx.tenantId,
      ctx.branchId,
      id,
      input,
      ctx.userId
    );

    return successResponse(updated);
  })
);
