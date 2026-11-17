/**
 * Dates, times and numbers in the page's language.
 *
 * Arabic pages get Arabic month and day names but Western digits (0-9), the
 * digits the app already uses for codes, phone numbers and amounts. Formatting
 * without a locale let each phone pick its own: the same screen showed
 * ٢٠٢٦/١١/٣٠ on one phone and 11/30/2026 on another, next to amounts in 0-9.
 */

/** The Intl locale for a page locale ('ar' | 'en'). */
export function intlLocale(locale: string): string {
  return locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US';
}

export function formatDate(
  value: string | number | Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(value).toLocaleDateString(intlLocale(locale), options);
}

export function formatDateTime(
  value: string | number | Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(value).toLocaleString(intlLocale(locale), options);
}

export function formatTime(
  value: string | number | Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(value).toLocaleTimeString(intlLocale(locale), options);
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(intlLocale(locale), options);
}

// ─── Branch-local session times ───────────────────────────────
// Session times are shown in the BRANCH's time zone, never the device's: the
// server sends `scheduledAtLocal` as "DD/MM/YYYY, HH:MM" (toLocalDisplay). These
// read that string, so a parent abroad or a laptop on another zone sees the
// same 17:00 as the academy.

/** "17/11/2026, 17:00" → { day: '2026-11-17', time: '17:00' }, or null. */
export function parseBranchLocal(local: string | null | undefined): { day: string; time: string } | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})/.exec(local ?? '');
  return m ? { day: `${m[3]}-${m[2]}-${m[1]}`, time: `${m[4]}:${m[5]}` } : null;
}

/** The branch-local time, "17:00" ('' when the value can't be read). */
export function branchTime(local: string | null | undefined): string {
  return parseBranchLocal(local)?.time ?? '';
}

/** The branch-local calendar day, "2026-11-17" ('' when unreadable). */
export function branchDay(local: string | null | undefined): string {
  return parseBranchLocal(local)?.day ?? '';
}

/** The branch-local date in the reader's language, e.g. "Tuesday, November 17". */
export function formatBranchDate(
  local: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }
): string {
  const p = parseBranchLocal(local);
  if (!p) return local ?? '';
  // Noon UTC of that day, printed in UTC, can't slip to a neighbouring day.
  return new Date(`${p.day}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { ...options, timeZone: 'UTC' });
}

/** Branch-local date and time: "Tuesday, November 17 · 17:00". */
export function formatBranchDateTime(local: string | null | undefined, locale: string): string {
  const p = parseBranchLocal(local);
  return p ? `${formatBranchDate(local, locale)} · ${p.time}` : (local ?? '');
}
