/**
 * GET /api/settings/display — how this academy and branch show money and
 * time: { currency, timeFormat }. Any signed-in academy user (staff, captain,
 * parent); read by useFormat() on every screen.
 */
import { withErrorHandler } from '@/lib/api/error-handler';
import { withAnyAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getDisplaySettings } from '@/services/display-settings.service';

export const GET = withErrorHandler(
  withAnyAuth(async (_request, ctx) => successResponse(await getDisplaySettings(ctx.tenantId, ctx.branchId || null)))
);
