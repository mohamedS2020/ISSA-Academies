/**
 * ISSA — Token Refresh API Route
 *
 * POST /api/auth/refresh
 *
 * Reads the refresh token from the httpOnly cookie (falls back to a body token
 * for non-browser clients), RE-VALIDATES the user against the DB (revocation:
 * deactivated/deleted users, suspended tenants, or inactive branches are locked
 * out within one access-token lifetime instead of the full refresh window), and
 * issues a fresh access token as an httpOnly cookie. The user's CURRENT role is
 * re-read so demotions take effect; the token's branchId is preserved so an
 * admin's active branch switch survives refresh.
 *
 * Response: { accessExpiresIn }  (+ Set-Cookie: issa_access)
 */

import { refreshTokenSchema } from '@/schemas/auth.schema';
import {
  verifyRefreshToken,
  generateAccessToken,
  getAccessExpiry,
  ttlToSeconds,
} from '@/lib/auth/jwt';
import { withErrorHandler, UnauthorizedError } from '@/lib/api/error-handler';
import { successResponse, tooManyRequestsResponse } from '@/lib/api/response';
import {
  readTokenFromCookies,
  REFRESH_COOKIE,
  setAccessCookie,
} from '@/lib/auth/cookies';
import { platformPrisma } from '@/lib/db/platform-client';
import { withTenantContext } from '@/lib/db/tenant-client';
import { refreshRateLimiter, getRateLimitKey } from '@/lib/auth/rate-limiter';
import type { JWTPayload } from '@/types';
import { UserRole } from '@/types';

const SESSION_INVALID = 'Session is no longer valid. Please log in again.';

export const POST = withErrorHandler(async (request: Request) => {
  // Rate limit (abuse guard)
  const rl = refreshRateLimiter.check(getRateLimitKey(request, 'refresh'));
  if (!rl.allowed) {
    return tooManyRequestsResponse(
      `Too many refresh attempts. Try again in ${rl.retryAfterSeconds} seconds.`
    );
  }

  // Prefer the httpOnly cookie; fall back to a body token (transitional / API clients).
  let refreshToken = readTokenFromCookies(request, REFRESH_COOKIE);
  if (!refreshToken) {
    try {
      refreshToken = refreshTokenSchema.parse(await request.json()).refreshToken;
    } catch {
      throw new UnauthorizedError('No refresh token provided');
    }
  }

  // Verify signature + expiry
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    if (error instanceof Error && error.message.includes('expired')) {
      throw new UnauthorizedError('Refresh token expired. Please log in again.');
    }
    throw new UnauthorizedError('Invalid refresh token');
  }

  // ── Revocation: re-validate against the DB and re-read the current role ──
  let role = decoded.role as UserRole;

  if (decoded.role === UserRole.SUPER_ADMIN) {
    const sa = await platformPrisma.superAdmin.findUnique({
      where: { id: decoded.userId },
      select: { isActive: true },
    });
    if (!sa || !sa.isActive) throw new UnauthorizedError(SESSION_INVALID);
  } else {
    if (!decoded.tenantId) throw new UnauthorizedError('Invalid refresh token');

    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: decoded.tenantId },
      select: { status: true },
    });
    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new UnauthorizedError(SESSION_INVALID);
    }

    const fresh = await withTenantContext(decoded.tenantId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: decoded.userId },
        select: { isActive: true, role: true },
      });
      if (!user || !user.isActive) return null;
      // The token's branch (the user's home branch, or an admin's switched
      // branch) must still be active.
      if (decoded.branchId) {
        const branch = await tx.branch.findUnique({
          where: { id: decoded.branchId },
          select: { isActive: true },
        });
        if (!branch || !branch.isActive) return null;
      }
      return { role: user.role as UserRole };
    });

    if (!fresh) throw new UnauthorizedError(SESSION_INVALID);
    role = fresh.role; // reflect demotions; branchId is preserved below
  }

  const payload: JWTPayload = {
    userId: decoded.userId,
    role,
    tenantId: decoded.tenantId,
    branchId: decoded.branchId,
  };
  const accessToken = generateAccessToken(payload);

  const res = successResponse({ accessExpiresIn: ttlToSeconds(getAccessExpiry()) });
  setAccessCookie(res, accessToken);
  return res;
});
