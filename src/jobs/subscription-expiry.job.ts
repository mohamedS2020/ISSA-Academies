/**
 * Subscription Expiry Job
 *
 * Daily job: flips ACTIVE subscriptions to EXPIRED when EITHER trigger fires:
 *   - the end date has passed (valid THROUGH endDate, so `end_date < CURRENT_DATE`), OR
 *   - all sessions have been used (`attended_sessions >= total_sessions`).
 *
 * Sets `expired_at` to anchor the post-expiry grace window: the endDate for the
 * date trigger, or NOW() for the sessions trigger. Raw SQL is required because
 * Prisma's updateMany can't compare two columns or set a column from another.
 *
 * (submitAttendance also flips sessions-exhausted subs immediately; this job is
 * the daily safety net that also catches the date trigger.)
 *
 * Then starts the queued renewals (UPCOMING) of trainees left with no ACTIVE
 * subscription — moving them to the renewal's level and group — and only after
 * that releases the group seats of trainees whose retake window has passed
 * (releaseLapsedSeats, hardening plan §42). Each part has its own error
 * handler and reports to Sentry; if any failed, the run throws at the end so
 * the scheduler counts the academy as failed instead of logging success.
 *
 * Runs per-tenant via the scheduler.
 */

import * as Sentry from '@sentry/nextjs';
import { withTenantContext } from '@/lib/db/tenant-client';
import { releaseLapsedSeats } from '@/services/group.service';
import { activateDueRenewals } from '@/services/subscription.service';

function reportFailure(tenantId: string, step: string, err: unknown): void {
  console.error(`[expiry-job] tenant=${tenantId} ${step} failed:`, err);
  Sentry.captureException(err, { tags: { job: 'subscription-expiry', step, tenantId } });
}

export async function runSubscriptionExpiryJob(tenantId: string): Promise<void> {
  const failed: string[] = [];

  try {
    const count = await withTenantContext(tenantId, async (tx) => {
      return tx.$executeRaw`
        UPDATE trainee_subscriptions
        SET status = 'EXPIRED',
            expired_at = CASE
              WHEN end_date < CURRENT_DATE THEN end_date::timestamptz
              ELSE NOW()
            END
        WHERE status = 'ACTIVE'
          AND (end_date < CURRENT_DATE OR attended_sessions >= total_sessions)
      `;
    });

    if (count > 0) {
      console.log(`[expiry-job] tenant=${tenantId} expired=${count} subscriptions`);
    }
  } catch (err) {
    failed.push('expire');
    reportFailure(tenantId, 'expire', err);
  }

  // After the flip, so a renewal starts the day its predecessor ended; before
  // releasing seats, so a renewing trainee never loses theirs.
  try {
    const started = await withTenantContext(tenantId, (tx) => activateDueRenewals(tx));
    if (started > 0) {
      console.log(`[expiry-job] tenant=${tenantId} started=${started} queued renewals`);
    }
  } catch (err) {
    failed.push('start-renewals');
    reportFailure(tenantId, 'start-renewals', err);
  }

  // After the flip, so a subscription that ended today already counts as ended.
  try {
    const released = await withTenantContext(tenantId, (tx) => releaseLapsedSeats(tx));
    if (released > 0) {
      console.log(`[expiry-job] tenant=${tenantId} released=${released} group seats`);
    }
  } catch (err) {
    failed.push('release-seats');
    reportFailure(tenantId, 'release-seats', err);
  }

  if (failed.length > 0) {
    throw new Error(`[expiry-job] tenant=${tenantId}: ${failed.join(', ')} failed (see Sentry)`);
  }
}
