/**
 * Login API Route
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
  getAccessExpiry,
  ttlToSeconds,
  type TokenPair,
} from '@/lib/auth/jwt';
import { setAuthCookies } from '@/lib/auth/cookies';
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
  errorResponse,
} from '@/lib/api/response';
import { UnauthorizedError } from '@/lib/api/error-handler';
import { UserRole } from '@/types';
import type { JWTPayload } from '@/types';
import { DEFAULT_SPORT } from '@/lib/theme/sports';

// ─── Types ──────────────────────────────────────────────────

interface LoginResponse {
  // Tokens are delivered as httpOnly cookies (see setAuthCookies), NOT in the
  // body — so they never touch JS-readable storage. `accessExpiresIn` (seconds)
  // is a non-secret hint the client uses to schedule silent refresh.
  accessExpiresIn: number;
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

/**
 * Cap on how many academies one phone number is checked against.
 *
 * Each candidate costs a bcrypt verification plus a tenant transaction, so this
 * bounds the work an unauthenticated request can trigger. A person at more than
 * a handful of academies is not a real scenario; an attacker farming expensive
 * work is.
 */
const MAX_ACADEMY_CANDIDATES = 5;

type PhoneCandidate = Awaited<ReturnType<typeof findPhoneCandidates>>[number];

interface TenantLoginResult {
  id: string;
  name: string;
  role: string;
  branchId: string;
  branchName: string;
  language: string;
}

interface VerifiedLogin {
  candidate: PhoneCandidate;
  result: TenantLoginResult;
}

/**
 * Every academy this phone number exists at, optionally narrowed to one slug.
 * Ordered so repeated logins behave identically — the old `findFirst` had no
 * ordering at all.
 */
async function findPhoneCandidates(phoneNumber: string, academySlug?: string) {
  return platformPrisma.userPhoneIndex.findMany({
    where: {
      phoneNumber,
      ...(academySlug ? { tenant: { slug: academySlug } } : {}),
    },
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
    orderBy: { createdAt: 'asc' },
    take: MAX_ACADEMY_CANDIDATES,
  });
}

/**
 * Check the password against one academy's records.
 *
 * Returns null for every failure — wrong password, inactive user, inactive
 * branch — rather than throwing, because a failure here only rules out THIS
 * academy. Throwing would abandon the remaining candidates and reintroduce the
 * lockout this function exists to fix.
 */
async function verifyCandidate(
  candidate: PhoneCandidate,
  password: string
): Promise<TenantLoginResult | null> {
  return withTenantContext(candidate.tenant.id, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: candidate.userId },
      include: { branch: { select: { id: true, name: true, isActive: true } } },
    });

    if (!user || !user.isActive || !user.branch.isActive) return null;

    const passwordValid = await comparePassword(password, user.passwordHash);
    if (!passwordValid) return null;

    return {
      id: user.id,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
      branchName: user.branch.name,
      language: user.language,
    };
  });
}

/**
 * Failure path only: does this phone + password work at some OTHER academy?
 *
 * Lets a user who opened the wrong subdomain get a message they can act on
 * instead of a flat "invalid credentials", without telling anyone who cannot
 * already prove the password.
 */
async function belongsToAnotherAcademy(input: {
  phoneNumber: string;
  password: string;
}): Promise<boolean> {
  const elsewhere = await findPhoneCandidates(input.phoneNumber);

  for (const candidate of elsewhere) {
    if (candidate.tenant.status !== 'ACTIVE') continue;
    if (await verifyCandidate(candidate, input.password)) return true;
  }
  return false;
}

/** Record the successful sign-in, outside the verification pass. */
async function touchLastLogin(tenantId: string, userId: string): Promise<void> {
  await withTenantContext(tenantId, (tx) =>
    tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
  );
}

/**
 * 409 telling the client to pick an academy and retry with `academySlug`.
 *
 * Only returned after the password has been verified at more than one academy,
 * so the names disclosed are already known to the caller.
 */
function academySelectionResponse(
  academies: { slug: string; name: string }[]
): Response {
  return errorResponse(
    'ACADEMY_SELECTION_REQUIRED',
    'This phone number is registered at more than one academy. Choose which one to sign in to.',
    409,
    { academies }
  );
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
      accessExpiresIn: ttlToSeconds(getAccessExpiry()),
      user: {
        id: superAdmin.id,
        name: superAdmin.name,
        role: UserRole.SUPER_ADMIN,
      },
    };

    const res = successResponse(response);
    setAuthCookies(res, tokens, input.rememberMe);
    return res;
  }

  // 3b. Resolve which academy (or academies) this phone belongs to.
  //
  // The phone index is unique on (phoneNumber, tenantId), so one number can
  // legitimately exist at several academies — a parent with children at two, or
  // a coach working for both. This used to be a `findFirst` with no ordering,
  // which picked one arbitrarily: such a person could only ever reach whichever
  // academy the database happened to return, and on the other academy's
  // subdomain they were told their account "belongs to a different academy".
  // A permanent, non-deterministic lockout.
  //
  // The subdomain, when present, is a TRUSTED narrowing (proxy.ts sets it and
  // always overwrites any client value). On the root domain we disambiguate by
  // password instead — see below.
  const academySlug = request.headers.get('x-academy-slug') ?? input.academySlug;

  const candidates = await findPhoneCandidates(input.phoneNumber, academySlug);

  // Verify the password against every candidate before deciding anything.
  //
  // Doing it in this order matters: it means no response reveals whether a
  // phone number is registered, or where, to a caller who cannot already prove
  // the password. The old code checked tenant status before the password and
  // leaked exactly that.
  const verified: VerifiedLogin[] = [];
  let suspendedAcademyMatched = false;

  for (const candidate of candidates) {
    const result = await verifyCandidate(candidate, input.password);
    if (!result) continue;

    if (candidate.tenant.status !== 'ACTIVE') {
      suspendedAcademyMatched = true;
      continue;
    }
    verified.push({ candidate, result });
  }

  if (verified.length === 0) {
    // The password was right, but that academy is suspended. Safe to say so now
    // — they proved the credential.
    if (suspendedAcademyMatched) {
      throw new UnauthorizedError('Your academy account has been suspended');
    }

    // On a subdomain, the account may simply live at a different academy.
    // Checking costs an extra lookup only on the failure path, and still only
    // tells someone who holds the password.
    if (academySlug && (await belongsToAnotherAcademy(input))) {
      throw new UnauthorizedError('This account belongs to a different academy');
    }

    throw new UnauthorizedError('Invalid phone number or password');
  }

  if (verified.length > 1) {
    // Same phone AND same password at more than one academy. Rare, but silently
    // choosing one is how the original bug behaved — ask instead. Only reachable
    // once the password is proven, so naming the academies leaks nothing.
    return academySelectionResponse(
      verified.map((v) => ({
        slug: v.candidate.tenant.slug,
        name: v.candidate.tenant.name,
      }))
    );
  }

  const { candidate: phoneIndex, result: loginResult } = verified[0];
  await touchLastLogin(phoneIndex.tenant.id, loginResult.id);

  // Reset rate limiter on success
  loginRateLimiter.reset(rateLimitKey);

  // Generate tokens with tenant/branch context
  const jwtPayload: JWTPayload = {
    userId: loginResult.id,
    role: loginResult.role as UserRole,
    tenantId: phoneIndex.tenant.id,
    branchId: loginResult.branchId,
  };

  const tokens: TokenPair = generateTokenPair(
    jwtPayload,
    input.rememberMe
  );

  const response: LoginResponse = {
    accessExpiresIn: ttlToSeconds(getAccessExpiry()),
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

  const res = successResponse(response);
  setAuthCookies(res, tokens, input.rememberMe);
  return res;
});
