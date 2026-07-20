/**
 * ISSA — Proxy (formerly Middleware)
 *
 * Next.js 16 renamed middleware.ts to proxy.ts.
 * This proxy handles:
 *   1. Per-academy subdomain resolution — reads <slug>.<ROOT_DOMAIN> from the
 *      Host header and forwards the slug downstream as `x-academy-slug` (no DB
 *      access here — this runs on the Edge). Server components / route handlers
 *      resolve the slug → tenant. On the bare/root domain (or the Railway
 *      *.up.railway.app domain before a custom domain is configured), no slug is
 *      set and the app falls back to JWT-based tenant resolution (unchanged).
 *   2. Locale routing — redirects /path to /en/path or /ar/path.
 *
 * SECURITY: the subdomain is a UX/theming/routing convenience ONLY. Tenant data
 * authorization is always enforced by the JWT (tenantId/branchId claims +
 * withTenantContext). We never trust the Host — and we always overwrite/clear
 * any client-supplied `x-academy-slug` so it can't be spoofed.
 *
 * The exported function MUST be named `proxy`, not `middleware`.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale } from '@/lib/i18n/config';

// The base domain the app is served from. Subdomains of it are academy slugs.
// Defaults to "localhost" for dev (so aqua.localhost:3007 works with no DNS).
// In production set NEXT_PUBLIC_ROOT_DOMAIN to your custom domain (e.g.
// "issaacademies.com"); the Railway *.up.railway.app domain can't host
// per-academy subdomains, so leaving this unset keeps the JWT fallback.
const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost').toLowerCase();

// Labels that are never academy slugs.
const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'admin', 'app', 'static', 'assets', 'cdn', 'mail',
]);

/**
 * Extract the academy subdomain label from the Host header, if the app is being
 * accessed via <slug>.<ROOT_DOMAIN>. Returns null for the root domain, reserved
 * labels, and any host that isn't a subdomain of ROOT_DOMAIN.
 */
function getAcademySlug(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase(); // strip port
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return null;
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const label = hostname
    .slice(0, hostname.length - ROOT_DOMAIN.length - 1)
    .split('.')[0];
  if (!label || RESERVED_SUBDOMAINS.has(label)) return null;
  return label;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const academySlug = getAcademySlug(request.headers.get('host'));

  // Forward the request, attaching the resolved academy slug as a TRUSTED header
  // (always set or cleared here — never passed through from the client).
  const forward = () => {
    const headers = new Headers(request.headers);
    if (academySlug) headers.set('x-academy-slug', academySlug);
    else headers.delete('x-academy-slug');
    return NextResponse.next({ request: { headers } });
  };

  // Skip internal paths, API routes, and static files for LOCALE routing — but
  // still forward the academy header (the login API reads it to scope login).
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // static files (favicon.ico, etc.)
  ) {
    return forward();
  }

  // Check if the pathname already has a locale prefix
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    return forward();
  }

  // Determine the best locale for the user
  const locale = getPreferredLocale(request);

  // Redirect to the locale-prefixed path (the follow-up request re-runs this
  // proxy, which re-attaches the academy header).
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
