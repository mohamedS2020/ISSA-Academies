/**
 * GET  /api/schedule — list sessions
 * POST /api/schedule — generate sessions for a group
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse, createdResponse } from '@/lib/api/response';
import { generateSessionsSchema } from '@/schemas/schedule.schema';
import { listSessions, generateSessionsForGroup } from '@/services/schedule.service';
import { resolveOwnCaptainId } from '@/services/dashboard.service';
import { requireAccess, requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';
import { addDays, format } from 'date-fns';

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.CAPTAIN);
    if (ctx.role !== UserRole.CAPTAIN) requireAccess(ctx, 'viewSchedule');

    const sp = new URL(request.url).searchParams;

    // Captains see only their own groups' sessions (FR-SC-03) — force their
    // captainId regardless of any captainId query param they might send.
    const captainScope =
      ctx.role === UserRole.CAPTAIN
        ? await resolveOwnCaptainId(ctx.tenantId, ctx.branchId, ctx.userId)
        : (sp.get('captainId') ?? undefined);

    const result = await listSessions(ctx.tenantId, {
      branchId: ctx.branchId,
      groupId: sp.get('groupId') ?? undefined,
      captainId: captainScope,
      traineeId: sp.get('traineeId') ?? undefined,
      dateFrom: sp.get('dateFrom') ?? undefined,
      dateTo: sp.get('dateTo') ?? undefined,
      status: sp.get('status') ?? undefined,
      page: sp.get('page') ? Number(sp.get('page')) : 1,
      limit: sp.get('limit') ? Number(sp.get('limit')) : 20,
    });

    return successResponse(result.data, result.pagination);
  })
);

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'manageSchedule');

    const body = await request.json();

    // If body has groupId + optional date range → generate sessions
    const input = generateSessionsSchema.parse({
      groupId: body.groupId,
      fromDate: body.fromDate ?? format(new Date(), 'yyyy-MM-dd'),
      toDate: body.toDate ?? format(addDays(new Date(), 28), 'yyyy-MM-dd'),
    });

    // Scoped to the caller's branch: the group id comes from the request, and
    // generating sessions for another branch's group must not be possible.
    const result = await generateSessionsForGroup(
      ctx.tenantId,
      input.groupId,
      input.fromDate,
      input.toDate,
      { branchId: ctx.branchId }
    );

    return createdResponse(result);
  })
);
