/**
 * ISSA — Sport theme catalog.
 *
 * The single source of truth for which sports the platform supports and their
 * NON-COLOR branding metadata (display labels + logo/favicon asset paths).
 *
 * Colors live in globals.css as `:root[data-sport="<key>"]` and
 * `:root.dark[data-sport="<key>"]` blocks — NOT here — so theming stays pure
 * CSS (no runtime style injection) and composes with the light/dark `.dark`
 * class automatically.
 *
 * `swimming` is the default and maps to the original ISSA palette (the base
 * `:root` / `.dark` blocks), so academies with no explicit theme look exactly
 * as before.
 *
 * Adding a new sport = one entry here + one pair of CSS blocks in globals.css
 * + assets under `public/sports/<key>/`.
 */

export interface SportTheme {
  key: string;
  /** English display label (e.g. the super-admin wizard dropdown). */
  label: string;
  /** Arabic display label. "ISSA" itself always stays Latin. */
  labelAr: string;
  /** Logo/mark asset path under /public. */
  logo: string;
  /** Favicon asset path under /public. */
  favicon: string;
}

export const SPORTS = {
  swimming: {
    key: 'swimming',
    label: 'Swimming',
    labelAr: 'سباحة',
    logo: '/sports/swimming/logo.svg',
    favicon: '/sports/swimming/favicon.svg',
  },
  football: {
    key: 'football',
    label: 'Football',
    labelAr: 'كرة القدم',
    logo: '/sports/football/logo.svg',
    favicon: '/sports/football/favicon.svg',
  },
  padel: {
    key: 'padel',
    label: 'Padel',
    labelAr: 'بادل',
    logo: '/sports/padel/logo.svg',
    favicon: '/sports/padel/favicon.svg',
  },
} as const satisfies Record<string, SportTheme>;

export type SportKey = keyof typeof SPORTS;

export const DEFAULT_SPORT: SportKey = 'swimming';

export const SPORT_KEYS = Object.keys(SPORTS) as SportKey[];

/** Type guard: is `value` one of the known sport keys? */
export function isSportKey(value: unknown): value is SportKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SPORTS, value);
}

/** Coerce any possibly-invalid/absent value to a safe SportKey. */
export function resolveSport(value: unknown): SportKey {
  return isSportKey(value) ? value : DEFAULT_SPORT;
}

/** Localized display label for a sport ("ar" → Arabic, otherwise English). */
export function sportLabel(key: SportKey, locale: string): string {
  return locale === 'ar' ? SPORTS[key].labelAr : SPORTS[key].label;
}
