/**
 * GET   /api/groups/[id] — group detail (with trainees + upcoming sessions)
 * PATCH /api/groups/[id] — update group
 */

import { withErrorHandler, NotFoundError } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { updateGroupSchema } from '@/schemas/group.schema';
import { getGroupById, updateGroup, redactGroupDetailForCaptain } from '@/services/group.service';
import { generateSessionsForGroup } from '@/services/schedule.service';
import { resolveOwnCaptainId } from '@/services/dashboard.service';
import { requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';
import { addDays, format } from 'date-fns';

// Keep this in sync with the initial window used on group creation.
const SESSION_WINDOW_DAYS = 28;

export const GET = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    // Captains may view their OWN group detail (FR-GR-04: view assigned groups
    // and their trainees); Admin/Moderator may view any group in the branch.
    requireMinRole(ctx, UserRole.CAPTAIN);
    const { id } = await routeContext!.params;
    const group = await getGroupById(ctx.tenantId, ctx.branchId, id);

    // A captain can only see a group they actually run — 404 (not 403) for
    // others, so we don't reveal that another captain's group exists. A
    // captain also must not see trainee PII (phone / system code) or the
    // plan price, so redact the payload server-side before returning.
    if (ctx.role === UserRole.CAPTAIN) {
      const ownCaptainId = await resolveOwnCaptainId(
        ctx.tenantId,
        ctx.branchId,
        ctx.userId
      );
      if (group.captain.id !== ownCaptainId) {
        throw new NotFoundError('Group not found');
      }
      return successResponse(redactGroupDetailForCaptain(group));
    }

    return successResponse(group);
  })
);

export const PATCH = withErrorHandler(
  withAuth(async (request, ctx, routeContext) => {
    requireMinRole(ctx, UserRole.ADMIN);
    const { id } = await routeContext!.params;
    const body = await request.json();
    const input = updateGroupSchema.parse(body);
    const { group, scheduleChanged } = await updateGroup(
      ctx.tenantId,
      ctx.branchId,
      id,
      input,
      ctx.userId
    );

    // If the schedule changed, the stale future sessions were removed inside
    // updateGroup — regenerate them from the new schedule. Best-effort: the
    // update is already committed, so a generation hiccup must not fail the
    // request (the weekly cron backfills).
    let sessionsRegenerated = 0;
    if (scheduleChanged) {
      try {
        const today = new Date();
        const result = await generateSessionsForGroup(
          ctx.tenantId,
          group.id,
          format(today, 'yyyy-MM-dd'),
          format(addDays(today, SESSION_WINDOW_DAYS), 'yyyy-MM-dd')
        );
        sessionsRegenerated = result.created;
      } catch (err) {
        console.error(
          `[groups] Session regeneration failed for group ${group.id}:`,
          err
        );
      }
    }

    return successResponse({ ...group, scheduleChanged, sessionsRegenerated });
  })
);
