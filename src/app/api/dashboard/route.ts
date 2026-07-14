/**
 * GET /api/dashboard — staff dashboard summary
 *
 * Branches on ctx.role internally, mirroring how dashboard/page.tsx
 * already switches its renderer by role:
 *   ADMIN / MODERATOR → getAdminDashboard
 *   CAPTAIN           → getCaptainDashboard (own profile resolved from userId)
 *
 * TRAINEE never reaches this route (redirected to the portal) and
 * SUPER_ADMIN has its own panel — both are rejected.
 */

import { withErrorHandler, ForbiddenError } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import {
  getAdminDashboard,
  getCaptainDashboard,
  resolveOwnCaptainId,
} from '@/services/dashboard.service';
import { UserRole } from '@/types';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    if (ctx.role === UserRole.ADMIN || ctx.role === UserRole.MODERATOR) {
      const dashboard = await getAdminDashboard(ctx.tenantId, ctx.branchId);
      return successResponse(dashboard);
    }

    if (ctx.role === UserRole.CAPTAIN) {
      const captainId = await resolveOwnCaptainId(ctx.tenantId, ctx.branchId, ctx.userId);
      const dashboard = await getCaptainDashboard(ctx.tenantId, ctx.branchId, captainId);
      return successResponse(dashboard);
    }

    throw new ForbiddenError('No dashboard available for this role');
  })
);
