/**
 * GET /api/finance/income — Financial Dashboard summary
 *
 * Returns { totalIncome, totalExpenses, netProfit, outstandingBalances, series }
 * for the given date range. Defaults to the last 30 days when dateFrom/dateTo
 * are omitted.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getDashboardSummary } from '@/services/finance.service';
import { requirePrivilege, requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';
import { subDays } from 'date-fns';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_view_finances');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

    const sp = new URL(request.url).searchParams;
    const dateFromParam = sp.get('dateFrom') ?? undefined;
    const dateToParam = sp.get('dateTo') ?? undefined;

    const dateTo = dateToParam ? new Date(`${dateToParam}T23:59:59.999Z`) : new Date();
    const dateFrom = dateFromParam
      ? new Date(`${dateFromParam}T00:00:00.000Z`)
      : subDays(dateTo, 30);

    const summary = await getDashboardSummary(ctx.tenantId, ctx.branchId, dateFrom, dateTo);
    return successResponse(summary);
  })
);
