/**
 * GET /api/finance/receipts — list receipts (paginated)
 * Filterable by traineeId, startDate, endDate
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { listReceipts } from '@/services/receipt.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.MODERATOR);

    const sp = new URL(request.url).searchParams;

    const result = await listReceipts(ctx.tenantId, ctx.branchId, {
      page: sp.get('page') ? Number(sp.get('page')) : 1,
      limit: sp.get('limit') ? Number(sp.get('limit')) : 20,
      traineeId: sp.get('traineeId') ?? undefined,
      startDate: sp.get('startDate') ?? undefined,
      endDate: sp.get('endDate') ?? undefined,
    });

    return successResponse(result.receipts, result.pagination);
  })
);
