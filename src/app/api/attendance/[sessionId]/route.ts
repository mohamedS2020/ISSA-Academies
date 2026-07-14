/**
 * GET   /api/attendance/[sessionId] — get attendance sheet for a session
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getAttendanceSheet } from '@/services/attendance.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.MODERATOR);

    // ⚠️ The dynamic segment is [sessionId], so the param key is `sessionId`,
    //    NOT `id`. Reading `.id` yields undefined, which Prisma treats as
    //    "no filter" — so getAttendanceSheet would return the first session in
    //    the branch regardless of which one was selected.
    const sessionId = (await routeContext!.params).sessionId as string;
    const sheet = await getAttendanceSheet(ctx.tenantId, ctx.branchId, sessionId);
    return successResponse(sheet);
  })
);
