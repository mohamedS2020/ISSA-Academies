/**
 * POST /api/superadmin/tenants/[id]/import/check — read and check a filled
 * template (multipart: file, branchId) without saving anything: what would be
 * created, every problem, and the academy's file with the problems marked.
 */
import { withErrorHandler, NotFoundError } from '@/lib/api/error-handler';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { getTenantById } from '@/services/tenant.service';
import { checkImport } from '@/services/import.service';
import { readUpload } from '@/lib/import/upload';

export const POST = withErrorHandler(
  withSuperAdminAuth(async (request, _ctx, routeContext) => {
    const { id } = await routeContext!.params;
    if (!(await getTenantById(id))) throw new NotFoundError('Tenant not found');
    const { file, branchId } = await readUpload(request);
    const result = await checkImport(id, branchId, file);
    return successResponse({ ...result, markedFile: result.markedFile?.toString('base64') ?? null });
  })
);
