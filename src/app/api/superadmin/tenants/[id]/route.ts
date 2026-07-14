/**
 * ISSA — Super Admin Single Tenant API
 *
 * GET   /api/superadmin/tenants/[id] — Get tenant details
 * PATCH /api/superadmin/tenants/[id] — Update tenant info
 *
 * Requires SUPER_ADMIN role.
 */

import { withErrorHandler, NotFoundError } from '@/lib/api/error-handler';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { updateTenantSchema } from '@/schemas/tenant.schema';
import { getTenantById, updateTenant } from '@/services/tenant.service';

// ─── GET — Tenant Details ───────────────────────────────────

export const GET = withErrorHandler(
  withSuperAdminAuth(async (request, _ctx, routeContext) => {
    const { id } = await routeContext!.params;

    const tenant = await getTenantById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }

    return successResponse(tenant);
  })
);

// ─── PATCH — Update Tenant ──────────────────────────────────

export const PATCH = withErrorHandler(
  withSuperAdminAuth(async (request, _ctx, routeContext) => {
    const { id } = await routeContext!.params;

    // Verify tenant exists
    const existing = await getTenantById(id);
    if (!existing) {
      throw new NotFoundError('Tenant not found');
    }

    const body = await request.json();
    const input = updateTenantSchema.parse(body);

    const updated = await updateTenant(id, input);

    return successResponse(updated);
  })
);
