import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import {
  successResponse,
  createdResponse,
  buildPaginationMeta,
} from '@/lib/api/response';
import { createUserSchema, listUsersQuerySchema } from '@/schemas/user.schema';
import { createUser, listUsers } from '@/services/user.service';
import { requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';

// ─── GET — List Users ─────────────────────────────────────────
export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireRole(ctx, UserRole.ADMIN);

    const { searchParams } = new URL(request.url);
    const query = listUsersQuerySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      role: searchParams.get('role') ?? undefined,
      isActive: searchParams.get('isActive') ?? undefined,
      search: searchParams.get('search') ?? undefined,
    });

    const { users, total } = await listUsers(ctx.tenantId, ctx.branchId, query);

    return successResponse(
      users,
      buildPaginationMeta(total, query.page, query.limit)
    );
  })
);

// ─── POST — Create User ───────────────────────────────────────
export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireRole(ctx, UserRole.ADMIN);

    const body = await request.json();
    const input = createUserSchema.parse(body);

    const user = await createUser(ctx.tenantId, ctx.branchId, input, ctx.userId);

    return createdResponse(user);
  })
);
