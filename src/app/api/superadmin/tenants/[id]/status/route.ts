/**
 * ISSA — Tenant Status API
 *
 * PATCH /api/superadmin/tenants/[id]/status — Change tenant status
 *
 * Validates status transitions:
 *   ACTIVE → SUSPENDED ✓
 *   SUSPENDED → ACTIVE ✓
 *   * → DELETED ✓
 *   DELETED → * ✗
 *
 * Requires SUPER_ADMIN role.
 */

import {
  withErrorHandler,
  NotFoundError,
  BadRequestError,
} from '@/lib/api/error-handler';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { tenantStatusSchema } from '@/schemas/tenant.schema';
import {
  getTenantById,
  changeTenantStatus,
} from '@/services/tenant.service';

export const PATCH = withErrorHandler(
  withSuperAdminAuth(async (request, _ctx, routeContext) => {
    const { id } = await routeContext!.params;

    const existing = await getTenantById(id);
    if (!existing) {
      throw new NotFoundError('Tenant not found');
    }

    const body = await request.json();
    const { status } = tenantStatusSchema.parse(body);

    try {
      const updated = await changeTenantStatus(id, status);
      return successResponse(updated);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('Invalid status transition')
      ) {
        throw new BadRequestError(err.message);
      }
      throw err;
    }
  })
);
