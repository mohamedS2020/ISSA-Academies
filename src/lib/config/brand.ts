/**
 * Platform branding: the platform's name, in each language. Nothing else in
 * the app should spell it out. (An earlier version hardcoded the first
 * academy's name in 222 places: page titles, logo badges, trainee codes,
 * cookie names.)
 *
 * The name used to come from NEXT_PUBLIC_APP_NAME, with "Academy Platform" as
 * a placeholder, while the platform had no name. It has one now, and the logo
 * files carry it as artwork, so a variable that renamed only the text would
 * leave the two disagreeing. The variable is no longer read.
 *
 * Scope: this is the PLATFORM's name. An academy's own name lives in its tenant
 * record and is what academy-facing screens should show.
 *
 * The logo files are in public/assets/img; see src/components/layout/brand-logo.tsx.
 */

import { isValidLocale, type Locale } from '@/lib/i18n/config';

/** The name as written in each language. Keep both spellings exactly. */
export const APP_NAMES: Record<Locale, string> = {
  en: 'Yallacademy',
  ar: 'يلّا أكاديمي',
};

/** The English name, for places with no language of their own. */
export const APP_NAME: string = APP_NAMES.en;

/** The name in the page's language; English for anything unrecognised. */
export function appName(locale: string): string {
  return isValidLocale(locale) ? APP_NAMES[locale] : APP_NAME;
}
