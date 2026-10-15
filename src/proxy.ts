/**
 * Proxy (formerly Middleware)
 *
 * Next.js 16 renamed middleware.ts to proxy.ts.
 * This proxy handles:
 *   1. Per-academy subdomain resolution — reads <slug>.<ROOT_DOMAIN> from the
 *      Host header and forwards the slug downstream as `x-academy-slug` (no DB
 *      access here — this runs on the Edge). Server components / route handlers
 *      resolve the slug → tenant. On the bare/root domain (or the Railway
 *      *.up.railway.app domain before a custom domain is configured), no slug is
 *      set and the app falls back to JWT-based tenant resolution (unchanged).
 *   2. The marketing site — on the platform host (the root domain, or any host
 *      that is not a subdomain of it, e.g. localhost or the Railway URL), `/`
 *      serves the English landing page and `/ar` the Arabic one. They are
 *      rewrites to src/app/marketing/[locale]: the address bar keeps `/` and
 *      `/ar`. `/en` redirects to `/`. www redirects to the bare domain. Academy
 *      subdomains never see the marketing site.
 *   3. Locale routing — redirects /path to /en/path or /ar/path.
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
import { MARKETING_DEFAULT_LOCALE } from '@/lib/config/marketing';

// The base domain the app is served from. Subdomains of it are academy slugs.
// Defaults to "localhost" for dev (so aqua.localhost:3007 works with no DNS).
// In production set NEXT_PUBLIC_ROOT_DOMAIN to your custom domain (e.g.
// "example.com"); the Railway *.up.railway.app domain can't host
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

/**
 * The host the marketing site lives on: the root domain and www, plus any host
 * that is not a subdomain of ROOT_DOMAIN at all (localhost in development, the
 * Railway URL before the custom domain exists). Academy subdomains and the
 * reserved labels (api., admin., …) are not.
 */
function isPlatformHost(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return true;
  return !hostname.endsWith(`.${ROOT_DOMAIN}`);
}

/** Landing page routes: the default language at `/`, the others at `/<locale>`. */
function marketingTarget(pathname: string): { rewrite: string } | { redirect: string } | null {
  if (pathname === '/') return { rewrite: `/marketing/${MARKETING_DEFAULT_LOCALE}` };
  if (pathname === `/${MARKETING_DEFAULT_LOCALE}`) return { redirect: '/' };
  const locale = locales.find((candidate) => pathname === `/${candidate}`);
  if (locale) return { rewrite: `/marketing/${locale}` };
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get('host');
  const hostname = host?.split(':')[0].toLowerCase() ?? '';

  // One canonical host: www.<domain> → <domain>, keeping the path and query.
  // Skipped in development, where ROOT_DOMAIN is plain "localhost".
  if (ROOT_DOMAIN !== 'localhost' && hostname === `www.${ROOT_DOMAIN}`) {
    return NextResponse.redirect(new URL(`${pathname}${search}`, `https://${ROOT_DOMAIN}`), 308);
  }

  const academySlug = getAcademySlug(host);

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
  //
  // /monitoring is Sentry's tunnel route (next.config.ts → tunnelRoute). The
  // browser SDK POSTs error reports there and expects that exact path; without
  // this exclusion the locale redirect would rewrite it to /en/monitoring and
  // every client-side error report would be silently lost.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/monitoring') ||
    pathname.includes('.') // static files (favicon.ico, etc.)
  ) {
    return forward();
  }

  // The marketing site, on the platform host only. Everything else on that
  // host (/en/login, /ar/admin, …) continues to the app below, unchanged.
  if (!academySlug && isPlatformHost(hostname)) {
    const target = marketingTarget(pathname);
    if (target && 'redirect' in target) {
      return NextResponse.redirect(new URL(`${target.redirect}${search}`, request.url), 308);
    }
    if (target) {
      const headers = new Headers(request.headers);
      headers.delete('x-academy-slug'); // never trust a client-supplied one
      return NextResponse.rewrite(new URL(target.rewrite, request.url), { request: { headers } });
    }
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
