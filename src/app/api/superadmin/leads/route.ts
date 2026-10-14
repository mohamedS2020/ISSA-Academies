/**
 * Super Admin: Marketing Leads
 *
 * GET /api/superadmin/leads — demo requests from the landing page, newest
 * first, with a count per status. Filters: status, search (name, academy or
 * phone), page, pageSize.
 *
 * Requires SUPER_ADMIN role: leads hold names and phone numbers.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { listLeadsQuerySchema } from '@/schemas/lead.schema';
import { listLeads } from '@/services/lead.service';

export const GET = withErrorHandler(
  withSuperAdminAuth(async (request) => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const query = listLeadsQuerySchema.parse(params);
    const result = await listLeads(query);
    return successResponse(
      { items: result.items, counts: result.counts },
      {
        page: result.page,
        limit: result.pageSize,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
      }
    );
  })
);
