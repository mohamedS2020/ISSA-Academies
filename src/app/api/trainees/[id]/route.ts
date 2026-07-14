import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { updateTraineeSchema } from '@/schemas/trainee.schema';
import {
  getTraineeById,
  updateTrainee,
  deactivateTrainee,
} from '@/services/trainee.service';
import { requirePrivilege, requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

// ─── GET — Get Trainee By ID ──────────────────────────────────
export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_view_trainees');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

    const { id } = await routeCtx!.params;
    const trainee = await getTraineeById(ctx.tenantId, ctx.branchId, id);

    return successResponse(trainee);
  })
);

// ─── PATCH — Update Trainee / Deactivate ─────────────────────
export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_manage_trainees');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

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
