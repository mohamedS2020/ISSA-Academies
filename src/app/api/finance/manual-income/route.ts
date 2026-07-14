/**
 * GET  /api/finance/manual-income — list manual income entries (paginated)
 * POST /api/finance/manual-income — create a manual income entry
 *
 * Manual income = money received NOT tied to a subscription (grants, rentals,
 * one-off sales). Each entry mirrors into an INCOME FinancialTransaction, so
 * it flows into the finance dashboard income/net-profit totals automatically.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse, createdResponse } from '@/lib/api/response';
import {
  createManualIncomeSchema,
  listManualIncomeQuerySchema,
} from '@/schemas/finance.schema';
import { createManualIncome, listManualIncome } from '@/services/finance.service';
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
    const query = listManualIncomeQuerySchema.parse({
      page: sp.get('page') ?? undefined,
      limit: sp.get('limit') ?? undefined,
      category: sp.get('category') ?? undefined,
      dateFrom: sp.get('dateFrom') ?? undefined,
      dateTo: sp.get('dateTo') ?? undefined,
    });

    const result = await listManualIncome(ctx.tenantId, ctx.branchId, query);
    return successResponse(result.incomes, result.pagination);
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
    const input = createManualIncomeSchema.parse(body);
    const income = await createManualIncome(ctx.tenantId, ctx.branchId, ctx.userId, input);

    return createdResponse(income);
  })
);
