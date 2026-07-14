/**
 * ISSA — Subscription Expiry Job
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
 * Runs per-tenant via the scheduler.
 */

import { withTenantContext } from '@/lib/db/tenant-client';

export async function runSubscriptionExpiryJob(tenantId: string): Promise<void> {
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
    console.error(`[expiry-job] tenant=${tenantId} error:`, err);
  }
}
