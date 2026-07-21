/**
 * ISSA — Auth Middleware
 *
 * Higher-order function that wraps API route handlers with authentication
 * and authorization. Extracts the Bearer token, verifies it, resolves
 * tenant context, loads moderator privileges, and injects RequestContext.
 *
 * ⚠️ SECURITY: Check role BEFORE tenantId. Super admin tokens have no
 *    tenantId — if the null check runs first, a loose comparison could
 *    let super admin tokens slip through to tenant routes.
 *
 * Usage:
 *   export const GET = withErrorHandler(
 *     withAuth(async (request, ctx) => {
 *       return successResponse(ctx);
 *     }, { roles: [UserRole.ADMIN, UserRole.MODERATOR] })
 *   );
 */

import { verifyAccessToken, type TokenPayload } from './jwt';
import { readTokenFromCookies, ACCESS_COOKIE } from './cookies';
import {
  resolveTenantContext,
  buildRequestContext,
} from '@/lib/db/tenant-resolver';
import { withTenantContext } from '@/lib/db/tenant-client';
import {
  UserRole,
  type RequestContext,
  type ModeratorPrivilege,
} from '@/types';
import {
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/api/error-handler';

// ─── Types ──────────────────────────────────────────────────

export interface AuthOptions {
  /** Restrict access to specific roles. If empty, any authenticated user is allowed. */
  roles?: UserRole[];
  /** Require specific moderator privileges (only checked for MODERATOR role). */
  privileges?: ModeratorPrivilege[];
  /** If true, super admin tokens are allowed (route is under /api/superadmin). */
  allowSuperAdmin?: boolean;
}

export type AuthenticatedHandler = (
  request: Request,
  ctx: RequestContext,
  routeContext?: { params: Promise<Record<string, string>> }
) => Promise<Response>;

// ─── Token Extraction ───────────────────────────────────────

/**
 * Extract the access token — from the httpOnly cookie first, falling back to the
 * `Authorization: Bearer` header (for API clients / tests). The cookie path is
 * how the browser app authenticates now; the header path keeps non-browser
 * callers working (non-breaking hybrid).
 */
function extractToken(request: Request): string {
  const cookieToken = readTokenFromCookies(request, ACCESS_COOKIE);
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer' && parts[1]) {
      return parts[1];
    }
    throw new UnauthorizedError(
      'Invalid Authorization header format. Expected: Bearer <token>'
    );
  }

  throw new UnauthorizedError('Missing authentication');
}

// ─── Middleware ──────────────────────────────────────────────

/**
 * Wraps a route handler with authentication and authorization.
 *
 * Flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Verify JWT signature and expiry
 *   3. Resolve tenant context (schema name, branch)
 *   4. Check role against allowed roles (if specified)
 *   5. Load moderator privileges from DB (if role is MODERATOR)
 *   6. Check required privileges (if specified)
 *   7. Call the handler with RequestContext
 */
export function withAuth(
  handler: AuthenticatedHandler,
  options: AuthOptions = {}
): (
  request: Request,
  routeContext?: { params: Promise<Record<string, string>> }
) => Promise<Response> {
  return async (request, routeContext) => {
    // Step 1: Extract token
    const token = extractToken(request);

    // Step 2: Verify JWT
    let decoded: TokenPayload;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('expired')) {
          throw new UnauthorizedError('Token expired');
        }
        if (error.message.includes('invalid')) {
          throw new UnauthorizedError('Invalid token');
        }
      }
      throw new UnauthorizedError('Token verification failed');
    }

    // Step 3: Handle SUPER_ADMIN separately
    if (decoded.role === UserRole.SUPER_ADMIN) {
      if (!options.allowSuperAdmin) {
        throw new ForbiddenError(
          'Super admin tokens cannot access tenant routes. Use /api/superadmin/*'
        );
      }

      // Super admin context — no tenant or branch
      const ctx: RequestContext = {
        userId: decoded.userId,
        role: UserRole.SUPER_ADMIN,
        tenantId: '',
        branchId: '',
      };

      // Check role restriction
      if (options.roles && !options.roles.includes(UserRole.SUPER_ADMIN)) {
        throw new ForbiddenError(
          `Access denied. Required role: ${options.roles.join(' or ')}`
        );
      }

      return handler(request, ctx, routeContext);
    }

    // Step 4: Resolve tenant context (validates tenantId, branchId)
    const tenantCtx = resolveTenantContext(decoded);

    // Step 5: Check role restriction
    if (options.roles && !options.roles.includes(decoded.role as UserRole)) {
      throw new ForbiddenError(
        `Access denied. Required role: ${options.roles.join(' or ')}`
      );
    }

    // Step 6: Load moderator privileges from tenant DB
    let privileges: ModeratorPrivilege[] | undefined;
    if (decoded.role === UserRole.MODERATOR) {
      privileges = await loadModeratorPrivileges(
        tenantCtx.tenantId,
        decoded.userId
      );
    }

    // Step 7: Build full request context
    const ctx = buildRequestContext(decoded, privileges as string[]);

    // Step 8: Check required privileges (for moderators)
    if (options.privileges && options.privileges.length > 0) {
      if (decoded.role === UserRole.MODERATOR) {
        const missing = options.privileges.filter(
          (p) => !privileges?.includes(p)
        );
        if (missing.length > 0) {
          throw new ForbiddenError(
            `Access denied. Missing privileges: ${missing.join(', ')}`
          );
        }
      }
      // Admin always passes privilege checks — they have all privileges
    }

    return handler(request, ctx, routeContext);
  };
}

// ─── Privilege Loading ──────────────────────────────────────

/**
 * Load moderator privileges from the tenant database.
 * Cached per request — called once during middleware.
 */
async function loadModeratorPrivileges(
  tenantId: string,
  userId: string
): Promise<ModeratorPrivilege[]> {
  return withTenantContext(tenantId, async (tx) => {
    const privileges = await tx.userPrivilege.findMany({
      where: { userId },
      select: { privilege: true },
    });
    return privileges.map((p) => p.privilege as ModeratorPrivilege);
  });
}

// ─── Convenience Wrappers ───────────────────────────────────

/**
 * Require ADMIN role.
 */
export function withAdminAuth(handler: AuthenticatedHandler) {
  return withAuth(handler, { roles: [UserRole.ADMIN] });
}

/**
 * Require ADMIN or MODERATOR role.
 */
export function withStaffAuth(
  handler: AuthenticatedHandler,
  privileges?: ModeratorPrivilege[]
) {
  return withAuth(handler, {
    roles: [UserRole.ADMIN, UserRole.MODERATOR],
    privileges,
  });
}

/**
 * Require any authenticated user (any role).
 */
export function withAnyAuth(handler: AuthenticatedHandler) {
  return withAuth(handler);
}

/**
 * Require SUPER_ADMIN role (for /api/superadmin/* routes).
 */
export function withSuperAdminAuth(handler: AuthenticatedHandler) {
  return withAuth(handler, {
    roles: [UserRole.SUPER_ADMIN],
    allowSuperAdmin: true,
  });
}

/**
 * Require TRAINEE role (for /api/portal/* routes).
 *
 * Strictly TRAINEE-only — ADMIN/MODERATOR/CAPTAIN do not get
 * staff-impersonation access to the trainee portal.
 */
export function withTraineeAuth(handler: AuthenticatedHandler) {
  return withAuth(handler, { roles: [UserRole.TRAINEE] });
}
