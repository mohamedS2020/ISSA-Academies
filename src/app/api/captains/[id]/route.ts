import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { updateCaptainSchema } from '@/schemas/captain.schema';
import {
  getCaptainById,
  updateCaptain,
  deactivateCaptain,
} from '@/services/captain.service';
import { requirePrivilege, requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

// ─── GET — Get Captain By ID ──────────────────────────────────
export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_view_captains');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

    const { id } = await routeCtx!.params;
    const captain = await getCaptainById(ctx.tenantId, ctx.branchId, id);

    return successResponse(captain);
  })
);

// ─── PATCH — Update Captain / Deactivate ─────────────────────
export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_manage_captains');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

    const { id } = await routeCtx!.params;
    const body = await request.json();

    if (body.action === 'deactivate') {
      const result = await deactivateCaptain(
        ctx.tenantId,
        ctx.branchId,
        id,
        ctx.userId
      );
      return successResponse(result);
    }

    const input = updateCaptainSchema.parse(body);
    const updated = await updateCaptain(
      ctx.tenantId,
      ctx.branchId,
      id,
      input,
      ctx.userId
    );

    return successResponse(updated);
  })
);
