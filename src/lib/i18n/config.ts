/**
 * ISSA — i18n Configuration
 *
 * Centralized internationalization configuration used by next-intl
 * and the proxy (formerly middleware) for locale routing.
 */

export const locales = ['en', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/**
 * RTL locales — used to set dir="rtl" on the html element.
 */
export const rtlLocales: Locale[] = ['ar'];

/**
 * Check if a locale uses RTL layout.
 */
export function isRtlLocale(locale: string): boolean {
  return rtlLocales.includes(locale as Locale);
}

/**
 * Check if a string is a valid locale.
 */
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
