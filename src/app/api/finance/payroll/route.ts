/**
 * GET  /api/finance/payroll — list recorded payroll entries
 * POST /api/finance/payroll — record a payroll entry for a captain + period
 *
 * Admin-only — captain compensation is sensitive data.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse, createdResponse } from '@/lib/api/response';
import {
  recordPayrollSchema,
  listPayrollsQuerySchema,
} from '@/schemas/finance.schema';
import { recordPayroll, listPayrolls } from '@/services/payroll.service';
import { requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireRole(ctx, UserRole.ADMIN);

    const sp = new URL(request.url).searchParams;
    const query = listPayrollsQuerySchema.parse({
      page: sp.get('page') ?? undefined,
      limit: sp.get('limit') ?? undefined,
      captainId: sp.get('captainId') ?? undefined,
      periodStart: sp.get('periodStart') ?? undefined,
      periodEnd: sp.get('periodEnd') ?? undefined,
    });

    const result = await listPayrolls(ctx.tenantId, ctx.branchId, query);
    return successResponse(result.payrolls, result.pagination);
  })
);

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireRole(ctx, UserRole.ADMIN);

    const body = await request.json();
    const input = recordPayrollSchema.parse(body);
    const payroll = await recordPayroll(ctx.tenantId, ctx.branchId, ctx.userId, input);

    return createdResponse(payroll);
  })
);
