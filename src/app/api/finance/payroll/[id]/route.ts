/**
 * PATCH /api/finance/payroll/[id] — mark a payroll entry as paid
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { markPayrollPaid } from '@/services/payroll.service';
import { requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireRole(ctx, UserRole.ADMIN);

    const { id } = await routeContext!.params;
    const payroll = await markPayrollPaid(ctx.tenantId, ctx.branchId, id, ctx.userId);

    return successResponse(payroll);
  })
);
