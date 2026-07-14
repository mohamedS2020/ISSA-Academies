/**
 * GET  /api/subscriptions/plans — list plans (paginated)
 * POST /api/subscriptions/plans — create plan
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse, createdResponse } from '@/lib/api/response';
import { createPlanSchema, listPlansQuerySchema } from '@/schemas/subscription.schema';
import { createPlan, listPlans } from '@/services/subscription.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.MODERATOR);

    const sp = new URL(request.url).searchParams;
    const query = listPlansQuerySchema.parse({
      page: sp.get('page') ?? undefined,
      limit: sp.get('limit') ?? undefined,
      isActive: sp.get('isActive') ?? undefined,
      search: sp.get('search') ?? undefined,
    });

    const result = await listPlans(ctx.tenantId, ctx.branchId, query);
    return successResponse(result.plans, result.pagination);
  })
);

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.ADMIN);

    const body = await request.json();
    const input = createPlanSchema.parse(body);
    const plan = await createPlan(ctx.tenantId, ctx.branchId, input, ctx.userId);

    return createdResponse(plan);
  })
);
