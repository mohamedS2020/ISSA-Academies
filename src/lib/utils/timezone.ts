/**
 * ISSA — Timezone Utility
 *
 * Provides timezone conversion functions used by:
 *   - schedule.service.ts: converts group wall-clock times to UTC TIMESTAMPTZ
 *   - All display layers: converts UTC back to branch local time
 *
 * Convention:
 *   - branch.timezone is the source of truth (IANA string, e.g. "Africa/Cairo")
 *   - All session DateTime fields are stored as UTC (TIMESTAMPTZ)
 *   - Never hardcode "Africa/Cairo" in services — always read from branch record
 *
 * ⚠️ DST NOTE: toUTC() must be called ONCE PER SESSION inside a loop,
 *    not once before the loop. DST transitions can shift the UTC offset
 *    mid-series. See task 7.2 for details.
 */

/**
 * Convert a wall-clock time + date to UTC using the specified IANA timezone.
 *
 * @param wallClockTime - Local time string, e.g. "08:00" or "14:30"
 * @param date          - The date string (YYYY-MM-DD) or Date object for the session
 * @param ianaTimezone  - IANA timezone identifier, e.g. "Africa/Cairo"
 * @returns A Date object representing the UTC equivalent
 *
 * @example
 * // Cairo is UTC+2 (or UTC+3 during DST)
 * const utc = toUTC('08:00', '2024-01-15', 'Africa/Cairo');
 * // → 2024-01-15T06:00:00.000Z (UTC+2 in winter)
 */
export function toUTC(
  wallClockTime: string,
  date: string | Date,
  ianaTimezone: string
): Date {
  // Validate inputs
  if (!wallClockTime || !date || !ianaTimezone) {
    throw new Error(
      `toUTC: all arguments required — got time="${wallClockTime}", date="${date}", tz="${ianaTimezone}"`
    );
  }

  // Parse the time components
  const timeParts = wallClockTime.split(':');
  if (timeParts.length < 2) {
    throw new Error(`toUTC: invalid time format "${wallClockTime}" — expected "HH:MM"`);
  }
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`toUTC: invalid time values in "${wallClockTime}"`);
  }

  // Parse the date
  const dateStr = date instanceof Date ? formatDateString(date) : date;

  // Construct a datetime string that the Intl API can parse
  // We use a known approach: create a date in UTC, then compute the offset
  // for the target timezone on that specific date (handles DST correctly)
  const naiveUtc = new Date(`${dateStr}T${padTime(hours)}:${padTime(minutes)}:00.000Z`);

  if (isNaN(naiveUtc.getTime())) {
    throw new Error(`toUTC: invalid date "${dateStr}" or time "${wallClockTime}"`);
  }

  // Get the timezone offset for this specific date+time in the given timezone
  const offsetMs = getTimezoneOffsetMs(naiveUtc, ianaTimezone);

  // The wall-clock time IS in the local timezone, so subtract the offset to get UTC
  return new Date(naiveUtc.getTime() - offsetMs);
}

/**
 * Convert a UTC date to a display string in the branch's local timezone.
 *
 * @param utcDate      - A Date object in UTC
 * @param ianaTimezone - IANA timezone identifier
 * @returns Formatted local time string
 *
 * @example
 * const local = toLocalDisplay(new Date('2024-01-15T06:00:00Z'), 'Africa/Cairo');
 * // → "2024-01-15 08:00" (UTC+2 in winter)
 */
export function toLocalDisplay(utcDate: Date, ianaTimezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ianaTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(utcDate);
}

/**
 * Get just the local time portion (HH:MM) from a UTC date.
 */
export function toLocalTime(utcDate: Date, ianaTimezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ianaTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(utcDate);
}

/**
 * Get just the local date portion (YYYY-MM-DD) from a UTC date.
 */
export function toLocalDate(utcDate: Date, ianaTimezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ianaTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(utcDate);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

/**
 * Validate that a string is a valid IANA timezone identifier.
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// ─── Internal Helpers ───────────────────────────────────────

/**
 * Compute the UTC offset in milliseconds for a given date in a given timezone.
 *
 * This handles DST correctly because it computes the offset for the
 * specific date, not a fixed offset.
 */
function getTimezoneOffsetMs(referenceUtcDate: Date, ianaTimezone: string): number {
  // Format the date in the target timezone to get the local representation
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(referenceUtcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

  // Reconstruct the local date in UTC to compute the offset
  const localAsUtc = new Date(
    Date.UTC(
      parseInt(get('year'), 10),
      parseInt(get('month'), 10) - 1,
      parseInt(get('day'), 10),
      parseInt(get('hour'), 10),
      parseInt(get('minute'), 10),
      parseInt(get('second'), 10)
    )
  );

  // Offset = local time - UTC time
  return localAsUtc.getTime() - referenceUtcDate.getTime();
}

function padTime(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = padTime(date.getUTCMonth() + 1);
  const d = padTime(date.getUTCDate());
  return `${y}-${m}-${d}`;
}
