/**
 * ISSA — Super Admin Tenants API
 *
 * GET  /api/superadmin/tenants — List all tenants (paginated, filterable)
 * POST /api/superadmin/tenants — Create a new tenant (full provisioning)
 *
 * Requires SUPER_ADMIN role.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import {
  successResponse,
  createdResponse,
  buildPaginationMeta,
} from '@/lib/api/response';
import { createTenantSchema } from '@/schemas/tenant.schema';
import { createTenant, listTenants } from '@/services/tenant.service';

// ─── GET — List Tenants ─────────────────────────────────────

export const GET = withErrorHandler(
  withSuperAdminAuth(async (request) => {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    const result = await listTenants({ status, search, page, limit });

    return successResponse(
      result.tenants,
      buildPaginationMeta(result.total, result.page, result.limit)
    );
  })
);

// ─── POST — Create Tenant ───────────────────────────────────

export const POST = withErrorHandler(
  withSuperAdminAuth(async (request) => {
    const body = await request.json();
    const input = createTenantSchema.parse(body);

    const result = await createTenant(input);

    return createdResponse({
      tenant: result.tenant,
      adminCredentials: result.adminCredentials,
      branch: result.branch,
    });
  })
);
