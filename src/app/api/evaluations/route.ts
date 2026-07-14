/**
 * GET  /api/evaluations — list evaluations (by sessionId or traineeId)
 * POST /api/evaluations — create a new evaluation (Captain only)
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse, createdResponse } from '@/lib/api/response';
import { createEvaluationSchema } from '@/schemas/attendance.schema';
import {
  createEvaluation,
  listEvaluationsBySession,
} from '@/services/attendance.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.CAPTAIN);

    const sp = new URL(request.url).searchParams;
    const sessionId = sp.get('sessionId') ?? undefined;

    if (!sessionId) {
      return successResponse([]);
    }

    const evaluations = await listEvaluationsBySession(ctx.tenantId, sessionId);
    return successResponse(evaluations);
  })
);

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.CAPTAIN);

    const body = await request.json();
    const input = createEvaluationSchema.parse(body);

    const evaluation = await createEvaluation(
      ctx.tenantId,
      ctx.branchId,
      input.sessionId,
      input.traineeId,
      input.notes,
      ctx.userId
    );

    return createdResponse(evaluation);
  })
);
