/**
 * ISSA — Archive Retention Constants
 *
 * Single source of truth for the two retention cutoffs used across
 * finance.service.ts, report.service.ts, and archive-records.job.ts.
 *
 * ⚠️ Two different cutoffs exist on purpose — do not conflate them:
 *   - Attendance + subscription records: 1 year
 *   - Financial records (receipts, transactions, expenses, payroll): 5 years
 */

import { subYears } from 'date-fns';

export const ATTENDANCE_SUBSCRIPTION_RETENTION_YEARS = 1;
export const FINANCIAL_RETENTION_YEARS = 5;

export function getAttendanceSubscriptionArchiveCutoff(): Date {
  return subYears(new Date(), ATTENDANCE_SUBSCRIPTION_RETENTION_YEARS);
}

export function getFinancialArchiveCutoff(): Date {
  return subYears(new Date(), FINANCIAL_RETENTION_YEARS);
}

/**
 * True when a report/query date range requires reading the archive tables —
 * i.e. the requested start date falls before the retention cutoff.
 */
export function rangeSpansArchive(dateFrom: Date | string, cutoff: Date): boolean {
  const from = typeof dateFrom === 'string' ? new Date(dateFrom) : dateFrom;
  return from.getTime() < cutoff.getTime();
}
