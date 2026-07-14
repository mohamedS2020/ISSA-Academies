/**
 * POST /api/attendance — submit attendance for a session
 * GET  /api/attendance — list attendance records for a trainee
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { submitAttendanceSchema } from '@/schemas/attendance.schema';
import { submitAttendance, listAttendanceByTrainee } from '@/services/attendance.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.MODERATOR);

    const body = await request.json();
    const input = submitAttendanceSchema.parse(body);

    const result = await submitAttendance(
      ctx.tenantId,
      ctx.branchId,
      input.sessionId,
      input.records,
      ctx.userId
    );

    return successResponse(result);
  })
);

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.MODERATOR);

    const sp = new URL(request.url).searchParams;
    const traineeId = sp.get('traineeId') ?? undefined;

    if (!traineeId) {
      return successResponse({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    }

    const result = await listAttendanceByTrainee(
      ctx.tenantId,
      ctx.branchId,
      traineeId,
      sp.get('page') ? Number(sp.get('page')) : 1,
      sp.get('limit') ? Number(sp.get('limit')) : 20
    );

    return successResponse(result.data, result.pagination);
  })
);
