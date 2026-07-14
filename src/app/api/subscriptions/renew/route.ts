/**
 * POST /api/subscriptions/renew
 *
 * Manually renew a trainee's subscription:
 *   1. Close current ACTIVE subscription
 *   2. Create new subscription
 *   3. Re-assign to group (upsert)
 *   4. Generate receipt
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { createdResponse } from '@/lib/api/response';
import { renewSchema } from '@/schemas/subscription.schema';
import { renewSubscription } from '@/services/subscription.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.MODERATOR);

    const body = await request.json();
    const input = renewSchema.parse(body);
    const result = await renewSubscription(ctx.tenantId, ctx.branchId, ctx.userId, input);

    return createdResponse(result);
  })
);
