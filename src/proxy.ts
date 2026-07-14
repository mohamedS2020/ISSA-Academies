/**
 * ISSA — Proxy (formerly Middleware)
 *
 * Next.js 16 renamed middleware.ts to proxy.ts.
 * This proxy handles:
 *   1. Locale routing — redirects /path to /en/path or /ar/path
 *   2. Future: auth token validation can be added here
 *
 * The exported function MUST be named `proxy`, not `middleware`.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale } from '@/lib/i18n/config';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip internal paths, API routes, and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // static files (favicon.ico, etc.)
  ) {
    return NextResponse.next();
  }

  // Check if the pathname already has a locale prefix
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    return NextResponse.next();
  }

  // Determine the best locale for the user
  const locale = getPreferredLocale(request);

  // Redirect to the locale-prefixed path
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

/**
 * Determine the preferred locale from:
 *   1. Cookie (user preference from previous session)
 *   2. Accept-Language header
 *   3. Default locale
 */
function getPreferredLocale(request: NextRequest): string {
  // Check cookie first (persisted user preference)
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookieLocale && locales.includes(cookieLocale as typeof locales[number])) {
    return cookieLocale;
  }

  // Check Accept-Language header
  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    const preferred = acceptLanguage
      .split(',')
      .map((lang) => {
        const [code, qStr] = lang.trim().split(';q=');
        return { code: code.split('-')[0].toLowerCase(), q: qStr ? parseFloat(qStr) : 1 };
      })
      .sort((a, b) => b.q - a.q)
      .find((lang) => locales.includes(lang.code as typeof locales[number]));

    if (preferred) {
      return preferred.code;
    }
  }

  return defaultLocale;
}

export const config = {
  matcher: [
    // Match all paths except internal Next.js paths and static files
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
