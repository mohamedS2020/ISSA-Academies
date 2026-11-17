/**
 * GET  /api/subscriptions/renew?traineeId=…[&planId=…] — preview a renewal:
 *      the current and any queued subscription, the defaults to prefill (last
 *      plan, level, group), and the chosen plan's price and new dates.
 * POST /api/subscriptions/renew — renew. While the current subscription is
 *      still running the renewal is queued (UPCOMING) and starts the day after
 *      it ends; otherwise it starts today. Money paid now is recorded at once
 *      (receipt + ledger). See renewSubscription.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { createdResponse, successResponse } from '@/lib/api/response';
import { renewPreviewQuerySchema, renewSchema } from '@/schemas/subscription.schema';
import { getRenewalPreview, renewSubscription } from '@/services/subscription.service';
import { requireAccess } from '@/lib/auth/permissions';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'enroll');

    const sp = new URL(request.url).searchParams;
    const query = renewPreviewQuerySchema.parse({
      traineeId: sp.get('traineeId') ?? undefined,
      planId: sp.get('planId') ?? undefined,
    });
    const preview = await getRenewalPreview(ctx.tenantId, ctx.branchId, query);

    return successResponse(preview);
  })
);

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'enroll');

    const body = await request.json();
    const input = renewSchema.parse(body);
    const result = await renewSubscription(ctx.tenantId, ctx.branchId, ctx.userId, input);

    return createdResponse(result);
  })
);
