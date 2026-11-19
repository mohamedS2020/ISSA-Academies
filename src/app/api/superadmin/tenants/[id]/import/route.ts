/**
 * Academy data import (super admin).
 *
 * GET  /api/superadmin/tenants/[id]/import — the academy's branches (which are
 *      still empty, so can take an import) and its past imports.
 * POST /api/superadmin/tenants/[id]/import — import a filled template into an
 *      empty branch (multipart: file, branchId). All or nothing: on any
 *      problem, 422 with the problems and the marked-up file, nothing saved.
 *      On success, the one-time credentials file (base64).
 *
 * See src/services/import.service.ts.
 */
import { withErrorHandler, NotFoundError } from '@/lib/api/error-handler';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getTenantById } from '@/services/tenant.service';
import { getImportContext, runImport, ImportRejectedError } from '@/services/import.service';
import { readUpload } from '@/lib/import/upload';

// Hundreds of accounts: password hashing and one long transaction.
export const maxDuration = 300;

export const GET = withErrorHandler(
  withSuperAdminAuth(async (_request, _ctx, routeContext) => {
    const { id } = await routeContext!.params;
    if (!(await getTenantById(id))) throw new NotFoundError('Tenant not found');
    return successResponse(await getImportContext(id));
  })
);

export const POST = withErrorHandler(
  withSuperAdminAuth(async (request, ctx, routeContext) => {
    const { id } = await routeContext!.params;
    if (!(await getTenantById(id))) throw new NotFoundError('Tenant not found');
    const { file, fileName, branchId } = await readUpload(request);
    try {
      const result = await runImport(id, branchId, file, fileName, ctx.userId);
      return successResponse({
        importId: result.importId,
        summary: result.summary,
        sessionWarnings: result.sessionWarnings,
        credentials: result.credentials.toString('base64'),
      });
    } catch (err) {
      if (!(err instanceof ImportRejectedError)) throw err;
      return Response.json(
        {
          success: false,
          error: { code: 'IMPORT_REJECTED', message: err.message },
          data: {
            ok: false,
            summary: err.result.summary,
            issues: err.result.issues,
            markedFile: err.result.markedFile?.toString('base64') ?? null,
          },
        },
        { status: 422 }
      );
    }
  })
);
