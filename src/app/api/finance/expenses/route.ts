/**
 * GET  /api/finance/expenses — list expenses (paginated)
 * POST /api/finance/expenses — create expense
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse, createdResponse } from '@/lib/api/response';
import {
  createExpenseSchema,
  listExpensesQuerySchema,
} from '@/schemas/finance.schema';
import { createExpense, listExpenses } from '@/services/finance.service';
import { requirePrivilege, requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_view_finances');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

    const sp = new URL(request.url).searchParams;
    const query = listExpensesQuerySchema.parse({
      page: sp.get('page') ?? undefined,
      limit: sp.get('limit') ?? undefined,
      category: sp.get('category') ?? undefined,
      dateFrom: sp.get('dateFrom') ?? undefined,
      dateTo: sp.get('dateTo') ?? undefined,
    });

    const result = await listExpenses(ctx.tenantId, ctx.branchId, query);
    return successResponse(result.expenses, result.pagination);
  })
);

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_manage_expenses');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

    const body = await request.json();
    const input = createExpenseSchema.parse(body);
    const expense = await createExpense(ctx.tenantId, ctx.branchId, ctx.userId, input);

    return createdResponse(expense);
  })
);
