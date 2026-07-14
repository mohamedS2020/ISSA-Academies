/**
 * POST /api/subscriptions/enroll
 *
 * Atomically:
 *   1. Assert no active subscription (inside tx)
 *   2. Compute start/end dates
 *   3. Validate group plan match + capacity
 *   4. Create subscription + group assignment + receipt + financial tx
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { createdResponse } from '@/lib/api/response';
import { enrollSchema } from '@/schemas/subscription.schema';
import { enrollTrainee } from '@/services/subscription.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.MODERATOR);

    const body = await request.json();
    const input = enrollSchema.parse(body);
    const result = await enrollTrainee(ctx.tenantId, ctx.branchId, ctx.userId, input);

    return createdResponse(result);
  })
);
