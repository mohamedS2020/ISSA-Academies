/**
 * Browser storage keys, defined once.
 *
 * These were previously duplicated as string literals — once in the React
 * contexts and again inside the inline theme-init script in [locale]/layout.tsx,
 * which runs before React hydrates. Two copies of a key drift: rename one and
 * the pre-hydration script silently reads nothing, so the theme flashes.
 *
 * Deliberately a plain module with no 'use client' directive. The layout is a
 * server component; importing a value from a 'use client' file there would hand
 * it a client-reference proxy rather than the string itself.
 *
 * Neutral names, not a brand: they must survive the platform being named or
 * renamed without logging anyone out or resetting their theme.
 */

/** Theme preference: 'light' | 'dark' | 'system'. */
export const THEME_STORAGE_KEY = 'app_theme';

/** The signed-in user's profile, cached for instant render. */
export const USER_STORAGE_KEY = 'app_user';

/** Whether the user chose "remember me" at login. */
export const REMEMBER_STORAGE_KEY = 'app_remember';
