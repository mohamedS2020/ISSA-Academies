import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import {
  successResponse,
  createdResponse,
  buildPaginationMeta,
} from '@/lib/api/response';
import { createCaptainSchema, listCaptainsQuerySchema } from '@/schemas/captain.schema';
import { createCaptain, listCaptains } from '@/services/captain.service';
import { requireAccess } from '@/lib/auth/permissions';

// ─── GET — List Captains ──────────────────────────────────────
export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'viewCaptains');

    const { searchParams } = new URL(request.url);
    const query = listCaptainsQuerySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      isActive: searchParams.get('isActive') ?? undefined,
    });

    const { captains, total } = await listCaptains(
      ctx.tenantId,
      ctx.branchId,
      query
    );

    return successResponse(
      captains,
      buildPaginationMeta(total, query.page, query.limit)
    );
  })
);

// ─── POST — Register Captain ──────────────────────────────────
export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'manageCaptains');

    const body = await request.json();
    const input = createCaptainSchema.parse(body);

    const result = await createCaptain(
      ctx.tenantId,
      ctx.branchId,
      input,
      ctx.userId
    );

    // result includes { captain, portalPassword } — password returned ONCE
    return createdResponse(result);
  })
);
