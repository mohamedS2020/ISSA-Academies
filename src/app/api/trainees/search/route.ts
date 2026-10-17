import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { searchTraineeSchema } from '@/schemas/trainee.schema';
import { searchTrainees } from '@/services/trainee.service';
import { requireAccess } from '@/lib/auth/permissions';

// ─── GET — Search Trainees ────────────────────────────────────
export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    requireAccess(ctx, 'viewTrainees');

    const { searchParams } = new URL(request.url);
    const query = searchTraineeSchema.parse({
      q: searchParams.get('q') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    const { trainees, total } = await searchTrainees(
      ctx.tenantId,
      ctx.branchId,
      query
    );

    return successResponse({ trainees, total });
  })
);
