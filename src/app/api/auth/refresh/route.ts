/**
 * ISSA — Token Refresh API Route
 *
 * POST /api/auth/refresh
 *
 * Issues a new access token from a valid refresh token.
 * Does NOT issue a new refresh token (refresh token rotation
 * is not implemented in v1 — would require a token blocklist).
 *
 * Request:  { refreshToken: string }
 * Response: { accessToken: string }
 */

import { refreshTokenSchema } from '@/schemas/auth.schema';
import { verifyRefreshToken, generateAccessToken } from '@/lib/auth/jwt';
import { withErrorHandler, UnauthorizedError } from '@/lib/api/error-handler';
import { successResponse } from '@/lib/api/response';
import type { JWTPayload } from '@/types';
import { UserRole } from '@/types';

export const POST = withErrorHandler(async (request: Request) => {
  const body = await request.json();

  // Validate input
  const { refreshToken } = refreshTokenSchema.parse(body);

  // Verify refresh token
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    if (error instanceof Error && error.message.includes('expired')) {
      throw new UnauthorizedError('Refresh token expired. Please log in again.');
    }
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Generate new access token with same claims
  const payload: JWTPayload = {
    userId: decoded.userId,
    role: decoded.role as UserRole,
    tenantId: decoded.tenantId,
    branchId: decoded.branchId,
  };

  const accessToken = generateAccessToken(payload);

  return successResponse({ accessToken });
});
