import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import {
  successResponse,
  createdResponse,
  buildPaginationMeta,
} from '@/lib/api/response';
import {
  createTraineeSchema,
  listTraineesQuerySchema,
} from '@/schemas/trainee.schema';
import { createTrainee, listTrainees } from '@/services/trainee.service';
import { requireAccess } from '@/lib/auth/permissions';

// ─── GET — List Trainees ──────────────────────────────────────
export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'viewTrainees');

    const { searchParams } = new URL(request.url);
    const query = listTraineesQuerySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      isActive: searchParams.get('isActive') ?? undefined,
    });

    const { trainees, total } = await listTrainees(
      ctx.tenantId,
      ctx.branchId,
      query
    );

    return successResponse(
      trainees,
      buildPaginationMeta(total, query.page, query.limit)
    );
  })
);

// ─── POST — Register Trainee ──────────────────────────────────
export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'manageTrainees');

    const body = await request.json();
    const input = createTraineeSchema.parse(body);

    const result = await createTrainee(
      ctx.tenantId,
      ctx.branchId,
      input,
      ctx.userId
    );

    // result includes { trainee, portalPassword } — password returned ONCE
    return createdResponse(result);
  })
);
