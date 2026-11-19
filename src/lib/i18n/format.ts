/**
 * Every number, date and time the app shows, formatted by what it is.
 *
 *   money     EGP 1,400 · 1,400.50 ج.م · KWD 12.750   (the academy's currency;
 *             decimals only when the amount has them; 3 for KWD, BHD, OMR)
 *   count     1,250
 *   percent   82.6%
 *   duration  12 h 50 min · 12 ساعة و50 دقيقة          (never 12.83)
 *   date      30 Nov 2026 · 30 نوفمبر 2026            (day first: no 11/30 vs 30/11)
 *   time      5:00 PM · 5:00 م, or 17:00               (the branch's choice)
 *
 * Arabic pages get Arabic month and day names but Western digits (0-9), the
 * digits the app already uses for codes, phone numbers and amounts. Formatting
 * without a locale let each phone pick its own: the same screen showed
 * ٢٠٢٦/١١/٣٠ on one phone and 11/30/2026 on another, next to amounts in 0-9.
 *
 * Screens use these through useFormat() (src/lib/format/use-format.ts), which
 * fills in the page language, the academy's currency and the branch's time
 * format. format-usage.test.ts fails on numbers formatted by hand.
 */
import { resolveCurrency, type CurrencyCode, type TimeFormat } from '@/lib/format/currency';

/** The Intl locale for numbers on a page ('ar' | 'en'). */
export function intlLocale(locale: string): string {
  return locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US';
}

/** Dates read day first in English too ("30 Nov 2026"): Egypt and the Gulf write 30/11. */
function dateLocale(locale: string): string {
  return locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
}

/**
 * A calendar date stored without a time (subscription ends, birthdays, expense
 * dates) arrives as UTC midnight. Printed in a time zone behind UTC it would
 * read as the day before, so such values are printed in UTC.
 */
function isDateOnly(value: string | number | Date): boolean {
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(value);
  if (value instanceof Date) return value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
  return false;
}

const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

/** "30 Nov 2026" / "30 نوفمبر 2026", or with the options given. */
export function formatDate(
  value: string | number | Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = DATE
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timeZone = options.timeZone ?? (isDateOnly(value) ? 'UTC' : undefined);
  return date.toLocaleDateString(dateLocale(locale), { ...options, timeZone });
}

/** "30 Nov 2026, 5:07 PM": a moment, in the device's time zone. */
export function formatDateTime(value: string | number | Date, locale: string, timeFormat: TimeFormat = '12h'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(intlLocale(locale), { hour: 'numeric', minute: '2-digit', hour12: timeFormat === '12h' });
  return `${formatDate(date, locale)}${locale === 'ar' ? '، ' : ', '}${time}`;
}

export function formatTime(
  value: string | number | Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(value).toLocaleTimeString(intlLocale(locale), options);
}

/** A wall-clock "17:00" in the branch's format: "5:00 PM" / "5:00 م", or "17:00". */
export function formatClock(hhmm: string | null | undefined, locale: string, timeFormat: TimeFormat = '12h'): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  if (timeFormat === '24h') return `${m[1].padStart(2, '0')}:${m[2]}`;
  return new Date(Date.UTC(1970, 0, 1, Number(m[1]), Number(m[2]))).toLocaleTimeString(intlLocale(locale), {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(intlLocale(locale), options);
}

/** A whole number with thousands separators: "1,250". */
export function formatCount(value: number, locale: string): string {
  return formatNumber(Math.round(value), locale, { maximumFractionDigits: 0 });
}

/** "82.6%": `value` is already a percentage (82.6, not 0.826). */
export function formatPercent(value: number, locale: string, decimals = 1): string {
  return `${formatNumber(value, locale, { maximumFractionDigits: decimals })}%`;
}

/**
 * Money in the academy's currency: "EGP 1,400", "1,400.50 ج.م", "KWD 12.750".
 * Decimals appear only when the amount has them, then all of the currency's
 * (so 12.5 dinar reads 12.500, never 12.5).
 */
export function formatMoney(amount: number | string | null | undefined, currency: CurrencyCode | string, locale: string): string {
  const info = resolveCurrency(currency);
  const n = Number(amount ?? 0);
  const value = Number.isFinite(n) ? n : 0;
  const scale = 10 ** info.decimals;
  const minor = Math.round(Math.abs(value) * scale);
  const digits = minor % scale === 0 ? 0 : info.decimals;
  const number = formatNumber(minor / scale, locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = value < 0 && minor > 0 ? '-' : '';
  return locale === 'ar' ? `${sign}${number} ${info.symbolAr}` : `${info.code} ${sign}${number}`;
}

/** The currency's label in the page language: "EGP" / "ج.م". */
export function currencyLabel(currency: CurrencyCode | string, locale: string): string {
  const info = resolveCurrency(currency);
  return locale === 'ar' ? info.symbolAr : info.code;
}

/** Arabic counted nouns: 1 ساعة, 2 ساعتان, 3-10 ساعات, 11+ ساعة. */
function arabicCount(n: number, one: string, two: string, few: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${formatCount(n, 'ar')} ${one}`;
}

/** Minutes as hours and minutes: "12 h 50 min", "45 min" / "12 ساعة و50 دقيقة". */
export function formatDuration(totalMinutes: number, locale: string): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (locale === 'ar') {
    const hours = arabicCount(h, 'ساعة', 'ساعتان', 'ساعات');
    const mins = arabicCount(m, 'دقيقة', 'دقيقتان', 'دقائق');
    if (!h) return m ? mins : '0 دقيقة';
    return m ? `${hours} و${mins}` : hours;
  }
  const hours = formatCount(h, locale);
  if (!h) return `${m} min`;
  return m ? `${hours} h ${m} min` : `${hours} h`;
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
  return new Date(`${p.day}T12:00:00Z`).toLocaleDateString(dateLocale(locale), { ...options, timeZone: 'UTC' });
}

/** Branch-local date and time: "Tuesday 17 November · 5:00 PM". */
export function formatBranchDateTime(local: string | null | undefined, locale: string, timeFormat: TimeFormat = '12h'): string {
  const p = parseBranchLocal(local);
  return p ? `${formatBranchDate(local, locale)} · ${formatClock(p.time, locale, timeFormat)}` : (local ?? '');
}
