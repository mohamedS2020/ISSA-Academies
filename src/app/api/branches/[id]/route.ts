import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { updateBranchSchema } from '@/schemas/branch.schema';
import { getBranchById, updateBranch } from '@/services/branch.service';
import { requireRole, requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

// ─── GET — Retrieve Branch by ID ────────────────────────────
export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    // Admins and Moderators can view branch info
    requireMinRole(ctx, UserRole.MODERATOR);

    const { id } = await routeContext!.params;
    const branch = await getBranchById(ctx.tenantId, id);

    if (!branch) {
      const { NotFoundError } = require('@/lib/api/error-handler');
      throw new NotFoundError('Branch not found');
    }

    return successResponse(branch);
  })
);

// ─── PATCH — Update Branch ──────────────────────────────────
export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    // Only Admin can modify branch details
    requireRole(ctx, UserRole.ADMIN);

    const { id } = await routeContext!.params;
    const body = await request.json();
    const input = updateBranchSchema.parse(body);

    const updated = await updateBranch(ctx.tenantId, id, input, ctx.userId);

    return successResponse(updated);
  })
);
