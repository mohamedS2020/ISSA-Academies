/**
 * PATCH /api/finance/payroll/[id] — mark a payroll entry as paid
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { markPayrollPaid } from '@/services/payroll.service';
import { requireAccess } from '@/lib/auth/permissions';

export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireAccess(ctx, 'managePayroll');

    const { id } = await routeContext!.params;
    const payroll = await markPayrollPaid(ctx.tenantId, ctx.branchId, id, ctx.userId);

    return successResponse(payroll);
  })
);
