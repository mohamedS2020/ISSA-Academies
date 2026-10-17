/**
 * POST /api/attendance/retake — schedule a retake session
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { createdResponse } from '@/lib/api/response';
import { scheduleRetakeSchema } from '@/schemas/attendance.schema';
import { scheduleRetake } from '@/services/attendance.service';
import { requireAccess } from '@/lib/auth/permissions';

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'markAttendance');

    const body = await request.json();
    const input = scheduleRetakeSchema.parse(body);

    const record = await scheduleRetake(
      ctx.tenantId,
      ctx.branchId,
      input.traineeId,
      input.subscriptionId,
      input.retakeSessionId,
      ctx.userId
    );

    return createdResponse(record);
  })
);
