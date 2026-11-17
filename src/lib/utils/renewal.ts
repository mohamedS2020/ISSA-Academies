/**
 * Renewal date and payment rules — pure functions, no database.
 *
 * A trainee may renew at any time:
 *   - while the current subscription is still running, the renewal is QUEUED
 *     (status UPCOMING) and starts the day after the current one's end date;
 *   - once it has ended (date passed or every session used), the renewal starts
 *     today.
 *
 * A queued renewal is ACTIVATED when the current one ends:
 *   - by the nightly expiry job, when the end date has passed;
 *   - by attendance, the moment the last session is used — which can be before
 *     the planned start. It then starts that day (the trainee would otherwise be
 *     blocked for the rest of the period).
 *
 * Dates are calendar days at midnight UTC, the way `@db.Date` columns store them
 * and the way enrolment already computes them.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PeriodTypeLike = 'FROM_SUBSCRIPTION_DATE' | 'FROM_MONTH_START';

export interface PlanPeriod {
  periodType: PeriodTypeLike | string;
  /** Required when periodType = FROM_SUBSCRIPTION_DATE. */
  periodDays: number | null;
}

export interface CurrentSubscriptionLike {
  status: string;
  endDate: Date;
  attendedSessions: number;
  totalSessions: number;
}

export interface DateWindow {
  startDate: Date;
  endDate: Date;
}

/** Midnight UTC of the calendar day `date` falls on (in UTC). */
export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(utcDay(date).getTime() + days * MS_PER_DAY);
}

/** The last calendar day of `date`'s month, at midnight UTC. */
export function lastDayOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/** The end date of a subscription of `plan` that starts on `startDate`. */
export function subscriptionEndDate(plan: PlanPeriod, startDate: Date): Date {
  if (plan.periodType === 'FROM_SUBSCRIPTION_DATE') {
    if (plan.periodDays == null) {
      // Same guard as enrolment: a null here would silently produce Invalid Date.
      throw new Error('Plan has periodType FROM_SUBSCRIPTION_DATE but no periodDays');
    }
    return addUtcDays(startDate, plan.periodDays);
  }
  // FROM_MONTH_START: to the end of the start date's calendar month.
  return lastDayOfUtcMonth(startDate);
}

/**
 * Whether a subscription is still running at `now`: ACTIVE, its end date not
 * yet passed (valid THROUGH the end date), and sessions left. Mirrors
 * getSubscriptionState's "ended" rule.
 */
export function isStillRunning(current: CurrentSubscriptionLike, now: Date): boolean {
  if (current.status !== 'ACTIVE') return false;
  if (current.attendedSessions >= current.totalSessions) return false;
  return now.getTime() < utcDay(current.endDate).getTime() + MS_PER_DAY;
}

/**
 * When a renewal bought at `now` runs, and whether it waits in the queue.
 *
 * `current` is the trainee's ACTIVE subscription, if any.
 */
export function renewalWindow(
  plan: PlanPeriod,
  current: CurrentSubscriptionLike | null,
  now: Date
): DateWindow & { queued: boolean } {
  if (current && isStillRunning(current, now)) {
    const startDate = addUtcDays(current.endDate, 1);
    return { startDate, endDate: subscriptionEndDate(plan, startDate), queued: true };
  }
  const startDate = utcDay(now);
  return { startDate, endDate: subscriptionEndDate(plan, startDate), queued: false };
}

/**
 * The dates a queued renewal takes when it is activated at `now`.
 *
 *   - On time or late (the nightly job, the day after the old end date or
 *     later): it keeps its planned dates.
 *   - Early (the old one used its last session before its end date): it starts
 *     today. A day-based plan then runs its full length from today; a monthly
 *     plan keeps its planned end, so the trainee still gets the whole month
 *     they paid for.
 */
export function activationWindow(plan: PlanPeriod, planned: DateWindow, now: Date): DateWindow {
  const today = utcDay(now);
  const plannedStart = utcDay(planned.startDate);
  if (today.getTime() >= plannedStart.getTime()) {
    return { startDate: plannedStart, endDate: utcDay(planned.endDate) };
  }
  if (plan.periodType === 'FROM_SUBSCRIPTION_DATE') {
    return { startDate: today, endDate: subscriptionEndDate(plan, today) };
  }
  return { startDate: today, endDate: utcDay(planned.endDate) };
}

/** Payment status from what has been paid against the price. */
export function paymentStatusFor(amountPaid: number, price: number): 'PAID' | 'PARTIAL' | 'UNPAID' {
  if (amountPaid <= 0) return 'UNPAID';
  return amountPaid >= price ? 'PAID' : 'PARTIAL';
}
