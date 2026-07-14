/**
 * PATCH  /api/finance/manual-income/[id] — update a manual income entry
 * DELETE /api/finance/manual-income/[id] — delete it (and its mirrored FinancialTransaction)
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse, noContentResponse } from '@/lib/api/response';
import { updateManualIncomeSchema } from '@/schemas/finance.schema';
import { updateManualIncome, deleteManualIncome } from '@/services/finance.service';
import { requirePrivilege, requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_manage_expenses');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

    const { id } = await routeContext!.params;
    const body = await request.json();
    const input = updateManualIncomeSchema.parse(body);
    const income = await updateManualIncome(ctx.tenantId, ctx.branchId, id, input, ctx.userId);

    return successResponse(income);
  })
);

export const DELETE = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_manage_expenses');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

    const { id } = await routeContext!.params;
    await deleteManualIncome(ctx.tenantId, ctx.branchId, id, ctx.userId);

    return noContentResponse();
  })
);
