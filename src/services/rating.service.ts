/**
 * ISSA — Captain Rating Service
 *
 * Trainees rate their captain (1..5 whole stars, editable anytime via upsert —
 * one row per (captain, trainee)). A captain's cumulative rating (average +
 * count) is surfaced beside their name for the captain themselves and for
 * admin/moderator.
 *
 * "Which captain" a trainee rates = the captain of their most-recently-joined
 * ACTIVE group. A trainee with no active group has no captain to rate yet.
 */

import { withTenantContext, type TransactionClient } from '@/lib/db/tenant-client';
import { ValidationError, NotFoundError } from '@/lib/api/error-handler';

export interface CaptainRatingSummary {
  average: number | null; // rounded to 1 decimal; null when there are no ratings
  count: number;
}

const roundAvg = (avg: number | null): number | null =>
  avg === null ? null : Math.round(avg * 10) / 10;

// ─── Resolve the captain a trainee rates ────────────────────

/** The captain of the trainee's most-recently-joined active group (or null). */
async function findTraineeCaptain(
  tx: TransactionClient,
  branchId: string,
  traineeId: string
): Promise<{ id: string; name: string } | null> {
  const link = await tx.groupTrainee.findFirst({
    where: { traineeId, group: { isActive: true, branchId } },
    orderBy: { joinedAt: 'desc' },
    select: {
      group: {
        select: { captain: { select: { id: true, user: { select: { name: true } } } } },
      },
    },
  });
  if (!link) return null;
  return { id: link.group.captain.id, name: link.group.captain.user.name };
}

// ─── Cumulative summaries (staff-facing) ────────────────────

/** Cumulative rating for a single captain. */
export async function getCaptainRatingSummary(
  tx: TransactionClient,
  captainId: string
): Promise<CaptainRatingSummary> {
  const agg = await tx.captainRating.aggregate({
    where: { captainId },
    _avg: { stars: true },
    _count: true,
  });
  return { average: roundAvg(agg._avg.stars), count: agg._count };
}

/** Cumulative ratings for many captains at once (for the captains list). */
export async function getCaptainRatingSummaries(
  tx: TransactionClient,
  captainIds: string[]
): Promise<Map<string, CaptainRatingSummary>> {
  const map = new Map<string, CaptainRatingSummary>();
  if (captainIds.length === 0) return map;

  const rows = await tx.captainRating.groupBy({
    by: ['captainId'],
    where: { captainId: { in: captainIds } },
    _avg: { stars: true },
    _count: { _all: true },
  });
  for (const r of rows) {
    map.set(r.captainId, { average: roundAvg(r._avg.stars), count: r._count._all });
  }
  // Captains with no ratings yet still get an entry.
  for (const id of captainIds) if (!map.has(id)) map.set(id, { average: null, count: 0 });
  return map;
}

/** The logged-in captain's own cumulative rating (for the dashboard header). */
export async function getOwnRatingSummary(
  tenantId: string,
  branchId: string,
  captainUserId: string
): Promise<CaptainRatingSummary> {
  return withTenantContext(tenantId, async (tx) => {
    const captain = await tx.captainProfile.findFirst({
      where: { userId: captainUserId, branchId },
      select: { id: true },
    });
    if (!captain) throw new NotFoundError('Captain profile not found');
    return getCaptainRatingSummary(tx, captain.id);
  });
}

// ─── Trainee side (portal) ──────────────────────────────────

/** The rating widget payload: the trainee's captain + the trainee's own stars. */
export async function getOwnCaptainRating(
  tenantId: string,
  branchId: string,
  traineeId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const captain = await findTraineeCaptain(tx, branchId, traineeId);
    if (!captain) return { captain: null, myStars: null, average: null, count: 0 };

    const [mine, summary] = await Promise.all([
      tx.captainRating.findUnique({
        where: { captainId_traineeId: { captainId: captain.id, traineeId } },
        select: { stars: true },
      }),
      getCaptainRatingSummary(tx, captain.id),
    ]);
    return {
      captain,
      myStars: mine?.stars ?? null,
      average: summary.average,
      count: summary.count,
    };
  });
}

/** Trainee upserts their star rating for their current captain (editable). */
export async function rateOwnCaptain(
  tenantId: string,
  branchId: string,
  traineeId: string,
  stars: number
) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new ValidationError('Rating must be a whole number from 1 to 5');
  }
  return withTenantContext(tenantId, async (tx) => {
    const captain = await findTraineeCaptain(tx, branchId, traineeId);
    if (!captain) throw new NotFoundError('You are not assigned to a captain yet');

    await tx.captainRating.upsert({
      where: { captainId_traineeId: { captainId: captain.id, traineeId } },
      create: { branchId, captainId: captain.id, traineeId, stars },
      update: { stars },
    });
    const summary = await getCaptainRatingSummary(tx, captain.id);
    return { captain, myStars: stars, average: summary.average, count: summary.count };
  });
}
