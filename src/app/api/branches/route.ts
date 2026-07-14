import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse, createdResponse } from '@/lib/api/response';
import { createBranchSchema } from '@/schemas/branch.schema';
import { createBranch, listBranches } from '@/services/branch.service';
import { requireRole, requireMinRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

// ─── GET — List Branches ────────────────────────────────────
export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    // Admins and Moderators can view branches
    requireMinRole(ctx, UserRole.MODERATOR);

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const branches = await listBranches(ctx.tenantId, includeInactive);

    return successResponse(branches);
  })
);

// ─── POST — Create Branch ────────────────────────────────────
export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    // Only Admin can create branches within their tenant
    requireRole(ctx, UserRole.ADMIN);

    const body = await request.json();
    const input = createBranchSchema.parse(body);

    const branch = await createBranch(ctx.tenantId, input, ctx.userId);

    return createdResponse(branch);
  })
);
