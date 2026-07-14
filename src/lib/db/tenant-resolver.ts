/**
 * ISSA — Tenant Resolver
 *
 * Extracts tenant_id and branch_id from the verified JWT claims
 * and provides the tenant schema name for database queries.
 *
 * This is the single source of truth for tenant context throughout
 * the request lifecycle. All services and API routes use this to
 * determine which tenant schema to query.
 */

import type { JWTPayload, RequestContext, UserRole } from '@/types';
import { getTenantSchemaName } from './migration-runner';

/**
 * Error thrown when tenant context cannot be resolved.
 */
export class TenantResolutionError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'TenantResolutionError';
    this.statusCode = statusCode;
  }
}

/**
 * Resolved tenant context for a request.
 */
export interface TenantContext {
  tenantId: string;
  schemaName: string;
  branchId: string;
  userId: string;
  role: UserRole;
}

/**
 * Resolve the tenant context from JWT claims.
 *
 * Rules:
 *   - SUPER_ADMIN tokens have no tenantId — they cannot access tenant routes.
 *     Super admin routes are handled separately at /api/superadmin/*.
 *   - All other roles MUST have a tenantId claim.
 *   - ADMIN may optionally have a branchId (they can access all branches).
 *   - MODERATOR, CAPTAIN, TRAINEE MUST have a branchId.
 *
 * @param payload - Verified JWT claims
 * @returns Resolved tenant context
 * @throws TenantResolutionError if context cannot be resolved
 */
export function resolveTenantContext(payload: JWTPayload): TenantContext {
  // ⚠️ Check role BEFORE tenantId — super admin tokens intentionally have
  // no tenant_id. A null check alone would allow super admin tokens to
  // slip through to tenant routes.
  if (payload.role === ('SUPER_ADMIN' as UserRole)) {
    throw new TenantResolutionError(
      'Super admin tokens cannot access tenant routes. Use /api/superadmin/*',
      403
    );
  }

  if (!payload.tenantId) {
    throw new TenantResolutionError('Missing tenant context in token');
  }

  if (!payload.userId) {
    throw new TenantResolutionError('Missing user context in token');
  }

  const schemaName = getTenantSchemaName(payload.tenantSlug ?? payload.tenantId);

  // Branch is required for MODERATOR, CAPTAIN, TRAINEE
  const branchRequiredRoles: UserRole[] = [
    'MODERATOR' as UserRole,
    'CAPTAIN' as UserRole,
    'TRAINEE' as UserRole,
  ];

  if (branchRequiredRoles.includes(payload.role) && !payload.branchId) {
    throw new TenantResolutionError(
      `Branch context required for role ${payload.role}`
    );
  }

  return {
    tenantId: payload.tenantId,
    schemaName,
    branchId: payload.branchId ?? '',
    userId: payload.userId,
    role: payload.role,
  };
}

/**
 * Build a full RequestContext from JWT payload and optional privileges.
 * Used by API route handlers to get everything they need in one call.
 */
export function buildRequestContext(
  payload: JWTPayload,
  privileges?: string[]
): RequestContext {
  const tenant = resolveTenantContext(payload);

  return {
    userId: tenant.userId,
    role: tenant.role,
    tenantId: tenant.tenantId,
    branchId: tenant.branchId,
    privileges: privileges as RequestContext['privileges'],
  };
}
