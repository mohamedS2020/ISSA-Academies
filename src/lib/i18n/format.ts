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
