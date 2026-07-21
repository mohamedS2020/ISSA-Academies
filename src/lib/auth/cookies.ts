/**
 * ISSA — Auth cookie helpers.
 *
 * Access + refresh tokens are stored in httpOnly cookies (not localStorage), so
 * they are NOT readable by JavaScript — they can't be exfiltrated by XSS and
 * don't appear in DevTools → Local Storage.
 *
 * Attributes:
 *   - HttpOnly            — not exposed to JS
 *   - Secure (prod only)  — HTTPS only; omitted in dev so http://localhost works
 *   - SameSite=Lax        — CSRF defense (cookie not sent on cross-site POSTs)
 *   - No Domain           — host-only, so each academy subdomain has an isolated
 *                           session (a bonus for tenant isolation)
 *   - access  Path=/          (sent to every route; short-lived)
 *   - refresh Path=/api/auth  (only sent to the auth routes → limited exposure)
 */

import { getAccessExpiry, getRefreshExpiry, ttlToSeconds } from './jwt';

export const ACCESS_COOKIE = 'issa_access';
export const REFRESH_COOKIE = 'issa_refresh';

const REFRESH_PATH = '/api/auth';

function serialize(
  name: string,
  value: string,
  opts: { maxAge: number; path: string }
): string {
  const parts = [
    `${name}=${value}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

/** Set the short-lived access cookie (Path=/). */
export function setAccessCookie(res: Response, accessToken: string): void {
  res.headers.append(
    'Set-Cookie',
    serialize(ACCESS_COOKIE, accessToken, {
      maxAge: ttlToSeconds(getAccessExpiry()),
      path: '/',
    })
  );
}

/** Set both access and refresh cookies (on login / branch switch). */
export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  rememberMe: boolean
): void {
  setAccessCookie(res, tokens.accessToken);
  res.headers.append(
    'Set-Cookie',
    serialize(REFRESH_COOKIE, tokens.refreshToken, {
      maxAge: ttlToSeconds(getRefreshExpiry(rememberMe)),
      path: REFRESH_PATH,
    })
  );
}

/** Expire both cookies (on logout). */
export function clearAuthCookies(res: Response): void {
  res.headers.append(
    'Set-Cookie',
    serialize(ACCESS_COOKIE, '', { maxAge: 0, path: '/' })
  );
  res.headers.append(
    'Set-Cookie',
    serialize(REFRESH_COOKIE, '', { maxAge: 0, path: REFRESH_PATH })
  );
}

/** Read a single cookie value from the incoming request. */
export function readTokenFromCookies(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return part.slice(idx + 1).trim() || null;
    }
  }
  return null;
}
