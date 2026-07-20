/**
 * ISSA — Login API Route
 *
 * POST /api/auth/login
 *
 * Authenticates a user by phone number + password.
 * Supports both super admin (platform DB) and tenant users (tenant DB).
 *
 * Flow:
 *   1. Rate limit check (per IP + phone)
 *   2. Validate request body (Zod)
 *   3. Look up user:
 *      a. Check super_admins in platform DB
 *      b. Check user_phone_index in platform DB → resolve tenant → verify in tenant DB
 *   4. Verify password
 *   5. Return access + refresh tokens
 *
 * Response: { accessToken, refreshToken, user: { id, name, role, tenantId?, branchId? } }
 */

import { loginSchema } from '@/schemas/auth.schema';
import { hashPassword, comparePassword } from '@/lib/auth/password';
import {
  generateTokenPair,
  type TokenPair,
} from '@/lib/auth/jwt';
import { platformPrisma } from '@/lib/db/platform-client';
import { withTenantContext } from '@/lib/db/tenant-client';
import {
  loginRateLimiter,
  getRateLimitKey,
} from '@/lib/auth/rate-limiter';
import { withErrorHandler } from '@/lib/api/error-handler';
import {
  successResponse,
  tooManyRequestsResponse,
} from '@/lib/api/response';
import { UnauthorizedError } from '@/lib/api/error-handler';
import { UserRole } from '@/types';
import type { JWTPayload } from '@/types';
import { DEFAULT_SPORT } from '@/lib/theme/sports';

// ─── Types ──────────────────────────────────────────────────

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    role: string;
    tenantId?: string;
    branchId?: string;
    branchName?: string;
    tenantName?: string;
    themeKey?: string;
    language?: string;
  };
}

// ─── Route Handler ──────────────────────────────────────────

export const POST = withErrorHandler(async (request: Request) => {
  const body = await request.json();

  // 1. Validate input
  const input = loginSchema.parse(body);

  // 2. Rate limit check
  const rateLimitKey = getRateLimitKey(request, input.phoneNumber);
  const rateLimitResult = loginRateLimiter.check(rateLimitKey);

  if (!rateLimitResult.allowed) {
    return tooManyRequestsResponse(
      `Too many login attempts. Try again in ${rateLimitResult.retryAfterSeconds} seconds.`
    );
  }

  // 3a. Try super admin login first
  const superAdmin = await platformPrisma.superAdmin.findUnique({
    where: { phoneNumber: input.phoneNumber },
  });

  if (superAdmin) {
    if (!superAdmin.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    const passwordValid = await comparePassword(
      input.password,
      superAdmin.passwordHash
    );
    if (!passwordValid) {
      throw new UnauthorizedError('Invalid phone number or password');
    }

    // Update last login
    await platformPrisma.superAdmin.update({
      where: { id: superAdmin.id },
      data: { lastLoginAt: new Date() },
    });

    // Reset rate limiter on success
    loginRateLimiter.reset(rateLimitKey);

    // Generate tokens — super admin has no tenant/branch
    const jwtPayload: JWTPayload = {
      userId: superAdmin.id,
      role: UserRole.SUPER_ADMIN,
    };

    const tokens = generateTokenPair(jwtPayload, input.rememberMe);

    const response: LoginResponse = {
      ...tokens,
      user: {
        id: superAdmin.id,
        name: superAdmin.name,
        role: UserRole.SUPER_ADMIN,
      },
    };

    return successResponse(response);
  }

  // 3b. Look up tenant user via phone index
  const phoneIndex = await platformPrisma.userPhoneIndex.findFirst({
    where: { phoneNumber: input.phoneNumber },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          schemaName: true,
          config: { select: { themeKey: true } },
        },
      },
    },
  });

  if (!phoneIndex) {
    throw new UnauthorizedError('Invalid phone number or password');
  }

  // Check tenant is active
  if (phoneIndex.tenant.status !== 'ACTIVE') {
    throw new UnauthorizedError('Your academy account has been suspended');
  }

  // If reached via an academy subdomain (x-academy-slug, set by proxy.ts), the
  // account must belong to THAT academy — otherwise give a clear error instead
  // of silently signing into another academy's themed UI. The subdomain is NOT
  // an auth boundary on its own (the JWT is); on the bare domain there's no
  // header and login stays global, exactly as before.
  const academySlug = request.headers.get('x-academy-slug');
  if (academySlug && phoneIndex.tenant.slug !== academySlug) {
    throw new UnauthorizedError('This account belongs to a different academy');
  }

  // 3c. Verify password in tenant DB
  const loginResult = await withTenantContext(
    phoneIndex.tenant.id,
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: phoneIndex.userId },
        include: {
          branch: { select: { id: true, name: true, isActive: true } },
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedError('Invalid phone number or password');
      }

      if (!user.branch.isActive) {
        throw new UnauthorizedError('Your branch is currently inactive');
      }

      const passwordValid = await comparePassword(
        input.password,
        user.passwordHash
      );
      if (!passwordValid) {
        throw new UnauthorizedError('Invalid phone number or password');
      }

      // Update last login
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
        branchName: user.branch.name,
        language: user.language,
      };
    }
  );

  // Reset rate limiter on success
  loginRateLimiter.reset(rateLimitKey);

  // Generate tokens with tenant/branch context
  const jwtPayload: JWTPayload = {
    userId: loginResult.id,
    role: loginResult.role as UserRole,
    tenantId: phoneIndex.tenant.id,
    tenantSlug: phoneIndex.tenant.slug,
    branchId: loginResult.branchId,
  };

  const tokens: TokenPair = generateTokenPair(
    jwtPayload,
    input.rememberMe
  );

  const response: LoginResponse = {
    ...tokens,
    user: {
      id: loginResult.id,
      name: loginResult.name,
      role: loginResult.role,
      tenantId: phoneIndex.tenant.id,
      branchId: loginResult.branchId,
      branchName: loginResult.branchName,
      tenantName: phoneIndex.tenant.name,
      themeKey: phoneIndex.tenant.config?.themeKey ?? DEFAULT_SPORT,
      language: loginResult.language,
    },
  };

  return successResponse(response);
});
