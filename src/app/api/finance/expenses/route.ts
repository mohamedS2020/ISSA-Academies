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
import { requireAccess } from '@/lib/auth/permissions';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'viewExpenses');

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
    requireAccess(ctx, 'manageExpenses');

    const body = await request.json();
    const input = createExpenseSchema.parse(body);
    const expense = await createExpense(ctx.tenantId, ctx.branchId, ctx.userId, input);

    return createdResponse(expense);
  })
);
