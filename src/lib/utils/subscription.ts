/**
 * ISSA — Subscription Lifecycle Helpers
 *
 * A subscription is "ended" when EITHER trigger fires (whichever comes first):
 *   - the end date is reached, OR
 *   - all sessions have been used (attendedSessions >= totalSessions).
 *
 * After it ends, there is a grace window of `plan.freezeRetakeDays` days during
 * which the trainee is still shown (greyed-out, un-markable) as a renewal
 * reminder. Past the grace window they drop off the attendance sheet entirely.
 *
 * `expiredAt` anchors the grace window. It's set the moment the subscription
 * ends (by submitAttendance for the sessions trigger, by the expiry job for the
 * date trigger). This helper also derives a correct anchor at read-time for the
 * brief window where the date has passed but the daily job hasn't run yet.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SubscriptionLike {
  status: string;
  endDate: Date;
  attendedSessions: number;
  totalSessions: number;
  expiredAt: Date | null;
  /** From the subscription's plan — the post-expiry grace/retake window. */
  freezeRetakeDays: number;
}

export interface SubscriptionState {
  /** Subscription is over (date reached, sessions used, or status EXPIRED). */
  ended: boolean;
  /** Ended but still inside the freezeRetakeDays grace window. */
  withinGrace: boolean;
  /** Ended and the grace window has elapsed. */
  pastGrace: boolean;
}

export function getSubscriptionState(
  sub: SubscriptionLike,
  now: Date = new Date()
): SubscriptionState {
  const endedByStatus = sub.status === 'EXPIRED';
  // Valid THROUGH endDate (inclusive) — ended only once the day AFTER endDate
  // has begun. endDate is a @db.Date (midnight), so add one day.
  const endedByDate = now.getTime() >= sub.endDate.getTime() + MS_PER_DAY;
  const endedBySessions = sub.attendedSessions >= sub.totalSessions;
  const ended = endedByStatus || endedByDate || endedBySessions;

  if (!ended) {
    return { ended: false, withinGrace: false, pastGrace: false };
  }

  // Anchor = when it actually ended. Prefer the stored expiredAt; otherwise
  // derive it (date-passed → endDate; sessions-just-hit before flip → now).
  const anchor = sub.expiredAt ?? (endedByDate ? sub.endDate : now);
  const graceDeadline = anchor.getTime() + sub.freezeRetakeDays * MS_PER_DAY;
  const withinGrace = now.getTime() <= graceDeadline;

  return { ended: true, withinGrace, pastGrace: !withinGrace };
}
