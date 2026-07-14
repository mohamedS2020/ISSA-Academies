/**
 * GET  /api/groups — list groups
 * POST /api/groups — create group
 *
 * Supports ?planId= filter to return groups available for enrollment.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse, createdResponse } from '@/lib/api/response';
import { createGroupSchema, listGroupsQuerySchema } from '@/schemas/group.schema';
import { createGroup, listGroups, getGroupsForPlan } from '@/services/group.service';
import { generateSessionsForGroup } from '@/services/schedule.service';
import { resolveOwnCaptainId } from '@/services/dashboard.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';
import { addDays, format } from 'date-fns';

// How far ahead to pre-generate sessions when a group is first created.
// The weekly session-generation cron (scheduler.ts) extends this window
// forward from here on.
const INITIAL_SESSION_WINDOW_DAYS = 28;

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    // Captains may view their OWN groups (FR-GR-04); Admin/Moderator see all.
    requireMinRole(ctx, UserRole.CAPTAIN);

    const sp = new URL(request.url).searchParams;

    // Captains are always scoped to their own groups — never another
    // captain's, regardless of any captainId query param they might send.
    if (ctx.role === UserRole.CAPTAIN) {
      const ownCaptainId = await resolveOwnCaptainId(
        ctx.tenantId,
        ctx.branchId,
        ctx.userId
      );
      // Only the page/limit/isActive query params are user input. The
      // captainId is server-derived from the DB, so it's added AFTER the
      // schema parse rather than through it (re-validating a trusted,
      // already-persisted ID as untrusted input just risks false rejects).
      const paging = listGroupsQuerySchema.parse({
        page: sp.get('page') ?? undefined,
        limit: sp.get('limit') ?? undefined,
        isActive: sp.get('isActive') ?? undefined,
      });
      const result = await listGroups(ctx.tenantId, ctx.branchId, {
        ...paging,
        captainId: ownCaptainId,
      });
      return successResponse(result.groups, result.pagination);
    }

    // If planId is provided and no page, return capacity-aware list for enrollment
    const planId = sp.get('planId') ?? undefined;
    if (planId && !sp.get('page')) {
      const groups = await getGroupsForPlan(ctx.tenantId, ctx.branchId, planId);
      return successResponse(groups);
    }

    const query = listGroupsQuerySchema.parse({
      page: sp.get('page') ?? undefined,
      limit: sp.get('limit') ?? undefined,
      planId: sp.get('planId') ?? undefined,
      captainId: sp.get('captainId') ?? undefined,
      day: sp.get('day') ?? undefined,
      hour: sp.get('hour') ?? undefined,
      ageMin: sp.get('ageMin') ?? undefined,
      ageMax: sp.get('ageMax') ?? undefined,
      isActive: sp.get('isActive') ?? undefined,
    });

    const result = await listGroups(ctx.tenantId, ctx.branchId, query);
    return successResponse(result.groups, result.pagination);
  })
);

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireMinRole(ctx, UserRole.ADMIN);

    const body = await request.json();
    const input = createGroupSchema.parse(body);
    const group = await createGroup(ctx.tenantId, ctx.branchId, ctx.userId, input);

    // Auto-generate an initial window of sessions from the group's schedule
    // so the calendar, attendance, and portal show data immediately.
    // Best-effort: the group is already committed (separate transaction), so
    // a generation hiccup must not fail the request — the weekly cron backfills.
    let sessionsCreated = 0;
    try {
      const today = new Date();
      const result = await generateSessionsForGroup(
        ctx.tenantId,
        group.id,
        format(today, 'yyyy-MM-dd'),
        format(addDays(today, INITIAL_SESSION_WINDOW_DAYS), 'yyyy-MM-dd')
      );
      sessionsCreated = result.created;
    } catch (err) {
      console.error(
        `[groups] Initial session generation failed for group ${group.id}:`,
        err
      );
    }

    return createdResponse({ ...group, sessionsCreated });
  })
);
