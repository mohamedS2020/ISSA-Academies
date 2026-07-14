/**
 * ISSA — Tenant Usage Stats API
 *
 * GET /api/superadmin/tenants/[id]/usage — Get tenant usage statistics
 *
 * Returns aggregate counts: active users, trainees, subscriptions,
 * branches, groups — read from the tenant's PostgreSQL schema.
 *
 * Requires SUPER_ADMIN role.
 */

import { withErrorHandler, NotFoundError } from '@/lib/api/error-handler';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import {
  getTenantById,
  getTenantUsageStats,
} from '@/services/tenant.service';

export const GET = withErrorHandler(
  withSuperAdminAuth(async (request, _ctx, routeContext) => {
    const { id } = await routeContext!.params;

    const tenant = await getTenantById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }

    const stats = await getTenantUsageStats(id);

    return successResponse(stats);
  })
);
