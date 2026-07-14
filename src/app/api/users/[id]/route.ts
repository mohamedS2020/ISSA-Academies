import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import {
  updateUserSchema,
  setPrivilegesSchema,
  adminPasswordResetSchema,
} from '@/schemas/user.schema';
import {
  getUserById,
  updateUser,
  setPrivileges,
  deactivateUser,
  resetUserPassword,
} from '@/services/user.service';
import { requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

// ─── GET — Get User By ID ─────────────────────────────────────
export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    requireRole(ctx, UserRole.ADMIN);

    const { id } = await routeCtx!.params;
    const user = await getUserById(ctx.tenantId, ctx.branchId, id);

    return successResponse(user);
  })
);

// ─── PATCH — Update User / Set Privileges / Reset Password ────
export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeCtx) => {
    requireRole(ctx, UserRole.ADMIN);

    const { id } = await routeCtx!.params;
    const body = await request.json();

    // Route to the right operation based on body shape
    if ('privileges' in body && Object.keys(body).length === 1) {
      // Set moderator privileges
      const input = setPrivilegesSchema.parse(body);
      const result = await setPrivileges(
        ctx.tenantId,
        ctx.branchId,
        id,
        input,
        ctx.userId
      );
      return successResponse(result);
    }

    if (body.action === 'reset_password') {
      // Admin-initiated password reset
      adminPasswordResetSchema.parse({ userId: id });
      const result = await resetUserPassword(
        ctx.tenantId,
        ctx.branchId,
        id,
        ctx.userId
      );
      return successResponse(result);
    }

    if (body.action === 'deactivate') {
      // Deactivate user
      const result = await deactivateUser(
        ctx.tenantId,
        ctx.branchId,
        id,
        ctx.userId
      );
      return successResponse(result);
    }

    // Default: general user field update
    const input = updateUserSchema.parse(body);
    const updated = await updateUser(
      ctx.tenantId,
      ctx.branchId,
      id,
      input,
      ctx.userId
    );
    return successResponse(updated);
  })
);
