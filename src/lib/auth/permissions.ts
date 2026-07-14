/**
 * ISSA — Permission Definitions & Privilege Checking
 *
 * ⚠️  SERVER-ONLY — this file imports from error-handler → tenant-resolver → migration-runner.
 *    Do NOT import this file in Client Components.
 *    For UI privilege groups, import from '@/lib/auth/privilege-groups' instead.
 *
 * Role hierarchy:
 *   SUPER_ADMIN > ADMIN > MODERATOR > CAPTAIN > TRAINEE
 *
 * Only Moderators have configurable per-user privileges.
 * All other roles have fixed, well-defined permissions.
 */

import {
  UserRole,
  MODERATOR_PRIVILEGES,
  type ModeratorPrivilege,
  type RequestContext,
} from '@/types';

// Re-export for convenience
export { MODERATOR_PRIVILEGES, type ModeratorPrivilege };

// PRIVILEGE_GROUPS lives in a client-safe file; re-export here for server-side consumers.
export { PRIVILEGE_GROUPS } from '@/lib/auth/privilege-groups';

// ─── Role Hierarchy ─────────────────────────────────────────

/**
 * Numeric rank for each role — higher number = more privilege.
 * Used for hasMinRole() checks.
 */
const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.TRAINEE]: 0,
  [UserRole.CAPTAIN]: 1,
  [UserRole.MODERATOR]: 2,
  [UserRole.ADMIN]: 3,
  [UserRole.SUPER_ADMIN]: 4,
};

// ─── Privilege Groups ───────────────────────────────────────
// Moved to '@/lib/auth/privilege-groups' (client-safe).
// Re-exported above for server-side consumers.

// ─── Role Checking ──────────────────────────────────────────

/**
 * Check if the user has one of the specified roles.
 */
export function hasRole(ctx: RequestContext, ...roles: UserRole[]): boolean {
  return roles.includes(ctx.role);
}

/**
 * Check if the user's role is at least the specified minimum.
 * E.g. hasMinRole(ctx, 'MODERATOR') allows MODERATOR, ADMIN, SUPER_ADMIN.
 */
export function hasMinRole(ctx: RequestContext, minRole: UserRole): boolean {
  return ROLE_RANK[ctx.role] >= ROLE_RANK[minRole];
}

/**
 * Throw ForbiddenError if the user does not have one of the required roles.
 */
export function requireRole(ctx: RequestContext, ...roles: UserRole[]): void {
  if (!hasRole(ctx, ...roles)) {
    // Dynamic import to avoid circular dependency with error-handler
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ForbiddenError } = require('@/lib/api/error-handler');
    throw new ForbiddenError(
      `Access denied. Required role: ${roles.join(' or ')}`
    );
  }
}

/**
 * Throw ForbiddenError if the user's role is below the required minimum.
 */
export function requireMinRole(
  ctx: RequestContext,
  minRole: UserRole
): void {
  if (!hasMinRole(ctx, minRole)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ForbiddenError } = require('@/lib/api/error-handler');
    throw new ForbiddenError(
      `Access denied. Minimum role required: ${minRole}`
    );
  }
}

// ─── Privilege Checking (Moderators) ────────────────────────

/**
 * Check if a user has a specific privilege.
 *
 * - ADMIN always has all privileges (returns true).
 * - MODERATOR checks their assigned privilege list.
 * - Other roles always return false.
 */
export function hasPrivilege(
  ctx: RequestContext,
  privilege: ModeratorPrivilege
): boolean {
  // Admin has all privileges
  if (ctx.role === UserRole.ADMIN) return true;

  // Only moderators can have granular privileges
  if (ctx.role !== UserRole.MODERATOR) return false;

  // Check the privilege list
  return ctx.privileges?.includes(privilege) ?? false;
}

/**
 * Throw ForbiddenError if the user doesn't have the required privilege.
 * Admin always passes. Moderator is checked against their privilege list.
 */
export function requirePrivilege(
  ctx: RequestContext,
  privilege: ModeratorPrivilege
): void {
  if (!hasPrivilege(ctx, privilege)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ForbiddenError } = require('@/lib/api/error-handler');
    throw new ForbiddenError(
      `Access denied. Missing privilege: ${privilege}`
    );
  }
}

/**
 * Check if a user has ALL of the specified privileges.
 */
export function hasAllPrivileges(
  ctx: RequestContext,
  privileges: ModeratorPrivilege[]
): boolean {
  return privileges.every((p) => hasPrivilege(ctx, p));
}

/**
 * Check if a user has ANY of the specified privileges.
 */
export function hasAnyPrivilege(
  ctx: RequestContext,
  privileges: ModeratorPrivilege[]
): boolean {
  return privileges.some((p) => hasPrivilege(ctx, p));
}

// ─── Validation ─────────────────────────────────────────────

/**
 * Check if a string is a valid moderator privilege name.
 */
export function isValidPrivilege(
  privilege: string
): privilege is ModeratorPrivilege {
  return (MODERATOR_PRIVILEGES as readonly string[]).includes(privilege);
}

/**
 * Filter a list of strings to only valid privilege names.
 */
export function filterValidPrivileges(
  privileges: string[]
): ModeratorPrivilege[] {
  return privileges.filter(isValidPrivilege);
}
