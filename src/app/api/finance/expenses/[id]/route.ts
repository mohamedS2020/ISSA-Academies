/**
 * PATCH  /api/finance/expenses/[id] — update expense
 * DELETE /api/finance/expenses/[id] — delete expense (and its mirrored FinancialTransaction)
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse, noContentResponse } from '@/lib/api/response';
import { updateExpenseSchema } from '@/schemas/finance.schema';
import { updateExpense, deleteExpense } from '@/services/finance.service';
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
    const input = updateExpenseSchema.parse(body);
    const expense = await updateExpense(ctx.tenantId, ctx.branchId, id, input, ctx.userId);

    return successResponse(expense);
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
    await deleteExpense(ctx.tenantId, ctx.branchId, id, ctx.userId);

    return noContentResponse();
  })
);
