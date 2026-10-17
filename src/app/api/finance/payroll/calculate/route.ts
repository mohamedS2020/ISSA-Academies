/**
 * GET /api/finance/payroll/calculate — preview computed payroll (no persistence)
 *
 * ?captainId=&periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { calculatePayrollQuerySchema } from '@/schemas/finance.schema';
import { calculatePayrollPreview } from '@/services/payroll.service';
import { requireAccess } from '@/lib/auth/permissions';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'managePayroll');

    const sp = new URL(request.url).searchParams;
    const query = calculatePayrollQuerySchema.parse({
      captainId: sp.get('captainId') ?? undefined,
      periodStart: sp.get('periodStart') ?? undefined,
      periodEnd: sp.get('periodEnd') ?? undefined,
    });

    const preview = await calculatePayrollPreview(
      ctx.tenantId,
      ctx.branchId,
      query.captainId,
      query.periodStart,
      query.periodEnd
    );

    return successResponse(preview);
  })
);
