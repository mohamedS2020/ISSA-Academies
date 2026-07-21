/**
 * ISSA — Logout API Route
 *
 * POST /api/auth/logout
 *
 * Clears the httpOnly auth cookies. Intentionally requires no auth — it must
 * succeed even with an expired/invalid session (the goal is to remove cookies).
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { successResponse } from '@/lib/api/response';
import { clearAuthCookies } from '@/lib/auth/cookies';

export const POST = withErrorHandler(async () => {
  const res = successResponse({ ok: true });
  clearAuthCookies(res);
  return res;
});
