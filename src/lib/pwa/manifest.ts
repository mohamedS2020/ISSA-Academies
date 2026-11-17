/**
 * The web app manifest: what a phone needs to install the app on its home
 * screen. Served by src/app/app.webmanifest/route.ts, linked from the locale
 * layout.
 *
 * One per host and language. On an academy's subdomain the installed app
 * carries the academy's name and its sport's icon (a parent installs "Aqua
 * Stars", not the platform); on the main domain it is Yallacademy. The
 * language is the page's, so an Arabic page installs an Arabic app that opens
 * in Arabic, right to left.
 *
 * The marketing site keeps its own public/site.webmanifest.
 */

import type { MetadataRoute } from 'next';
import { appName } from '@/lib/config/brand';
import { BRAND_COLORS } from '@/lib/config/brand-colors';
import { isRtlLocale, isValidLocale, defaultLocale } from '@/lib/i18n/config';
import type { SportKey } from '@/lib/theme/sports';

export interface ManifestAcademy {
  name: string;
  sport: SportKey;
}

export function buildManifest(rawLocale: string | null, academy: ManifestAcademy | null): MetadataRoute.Manifest {
  const locale = rawLocale && isValidLocale(rawLocale) ? rawLocale : defaultLocale;
  const name = academy ? academy.name : appName(locale);
  const icons = academy ? `/sports/${academy.sport}` : '';

  return {
    // One installed app per host: the Arabic and English pages are the same app.
    id: '/',
    name,
    short_name: name,
    lang: locale,
    dir: isRtlLocale(locale) ? 'rtl' : 'ltr',
    // The login, which sends a signed-in user straight to their home. (The
    // locale root is the marketing site on the main domain.)
    start_url: `/${locale}/login`,
    scope: '/',
    display: 'standalone',
    // The light theme's page and header colours: the splash screen and the
    // status bar then match the first screen.
    background_color: BRAND_COLORS.mist,
    theme_color: BRAND_COLORS.white,
    icons: [
      { src: `${icons}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${icons}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${icons}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
