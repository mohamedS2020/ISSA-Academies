/**
 * ISSA — Captain Feedback Service
 *
 * A captain writes feedback on one of THEIR trainees (a trainee in one of the
 * captain's active groups). Feedback is a history — an append-only list of
 * timestamped entries — shown to the trainee in the portal and to
 * admin/moderator on the trainee detail page.
 */

import { withTenantContext, type TransactionClient } from '@/lib/db/tenant-client';
import { NotFoundError, ForbiddenError } from '@/lib/api/error-handler';

const feedbackSelect = {
  id: true,
  message: true,
  createdAt: true,
  captain: { select: { user: { select: { name: true } } } },
} as const;

/** Is `traineeId` in one of `captainId`'s active groups? (write-own-trainee gate) */
async function captainOwnsTrainee(
  tx: TransactionClient,
  branchId: string,
  captainId: string,
  traineeId: string
): Promise<boolean> {
  const link = await tx.groupTrainee.findFirst({
    where: { traineeId, group: { captainId, isActive: true, branchId } },
    select: { id: true },
  });
  return link !== null;
}

/** Resolve the CaptainProfile id for a captain user, and assert they own the trainee. */
async function assertCaptainOwnsTrainee(
  tx: TransactionClient,
  branchId: string,
  captainUserId: string,
  traineeId: string
): Promise<string> {
  const captain = await tx.captainProfile.findFirst({
    where: { userId: captainUserId, branchId },
    select: { id: true },
  });
  if (!captain) throw new NotFoundError('Captain profile not found');
  if (!(await captainOwnsTrainee(tx, branchId, captain.id, traineeId))) {
    throw new ForbiddenError('This trainee is not in one of your groups');
  }
  return captain.id;
}

/** Captain writes a new feedback entry on their trainee. */
export async function addCaptainFeedback(
  tenantId: string,
  branchId: string,
  captainUserId: string,
  traineeId: string,
  message: string
) {
  return withTenantContext(tenantId, async (tx) => {
    const captainId = await assertCaptainOwnsTrainee(tx, branchId, captainUserId, traineeId);
    return tx.captainFeedback.create({
      data: { branchId, captainId, traineeId, message },
      select: feedbackSelect,
    });
  });
}

/** All feedback for a trainee, newest first (portal + admin/mod read). */
export async function listCaptainFeedback(
  tenantId: string,
  branchId: string,
  traineeId: string
) {
  return withTenantContext(tenantId, async (tx) =>
    tx.captainFeedback.findMany({
      where: { traineeId, branchId },
      orderBy: { createdAt: 'desc' },
      select: feedbackSelect,
    })
  );
}

/**
 * Feedback for a trainee, but only if the requesting captain owns them — used by
 * the captain-facing history view (their group-detail feedback panel).
 */
export async function listCaptainFeedbackForOwnTrainee(
  tenantId: string,
  branchId: string,
  captainUserId: string,
  traineeId: string
) {
  return withTenantContext(tenantId, async (tx) => {
    await assertCaptainOwnsTrainee(tx, branchId, captainUserId, traineeId);
    return tx.captainFeedback.findMany({
      where: { traineeId, branchId },
      orderBy: { createdAt: 'desc' },
      select: feedbackSelect,
    });
  });
}
