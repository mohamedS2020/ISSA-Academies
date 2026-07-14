/**
 * GET    /api/subscriptions/plans/[id] — get plan detail
 * PATCH  /api/subscriptions/plans/[id] — update plan
 * DELETE /api/subscriptions/plans/[id] — deactivate plan (soft delete)
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { updatePlanSchema } from '@/schemas/subscription.schema';
import {
  getPlanById,
  updatePlan,
  deactivatePlan,
} from '@/services/subscription.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.MODERATOR);
    const { id } = await routeContext!.params;
    const plan = await getPlanById(ctx.tenantId, ctx.branchId, id);
    return successResponse(plan);
  })
);

export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.ADMIN);
    const { id } = await routeContext!.params;
    const body = await request.json();
    const input = updatePlanSchema.parse(body);
    const plan = await updatePlan(ctx.tenantId, ctx.branchId, id, input, ctx.userId);
    return successResponse(plan);
  })
);

export const DELETE = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.ADMIN);
    const { id } = await routeContext!.params;
    await deactivatePlan(ctx.tenantId, ctx.branchId, id, ctx.userId);
    return successResponse({ deactivated: true });
  })
);
