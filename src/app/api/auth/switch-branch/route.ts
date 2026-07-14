/**
 * POST /api/auth/switch-branch — re-issue tokens scoped to a different branch.
 *
 * Admin-only (moderators are branch-scoped and stay in their assigned branch).
 * Verifies the target branch is an ACTIVE branch of the admin's own tenant,
 * then mints a fresh access + refresh token pair carrying the new branchId.
 *
 * Both tokens must change: /api/auth/refresh copies branchId from the refresh
 * token, so re-issuing only the access token would silently revert the branch
 * on the next refresh.
 *
 * Request:  { branchId: string, rememberMe?: boolean }
 * Response: { accessToken, refreshToken, branchId, branchName }
 */

import { withErrorHandler, NotFoundError } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { requireRole } from '@/lib/auth/permissions';
import { successResponse } from '@/lib/api/response';
import { withTenantContext } from '@/lib/db/tenant-client';
import { generateTokenPair } from '@/lib/auth/jwt';
import { switchBranchSchema } from '@/schemas/auth.schema';
import { UserRole } from '@/types';
import type { JWTPayload } from '@/types';

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireRole(ctx, UserRole.ADMIN);

    const { branchId, rememberMe } = switchBranchSchema.parse(await request.json());

    // Must be an active branch of the admin's tenant. The lookup runs in the
    // tenant schema, so ids from other tenants simply aren't found.
    const branch = await withTenantContext(ctx.tenantId, (tx) =>
      tx.branch.findFirst({
        where: { id: branchId, isActive: true },
        select: { id: true, name: true },
      })
    );
    if (!branch) {
      throw new NotFoundError('Branch not found or inactive');
    }

    const payload: JWTPayload = {
      userId: ctx.userId,
      role: ctx.role as UserRole,
      tenantId: ctx.tenantId,
      branchId: branch.id,
    };
    const tokens = generateTokenPair(payload, rememberMe);

    return successResponse({
      ...tokens,
      branchId: branch.id,
      branchName: branch.name,
    });
  })
);
