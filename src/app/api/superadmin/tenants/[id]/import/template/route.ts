/**
 * GET /api/superadmin/tenants/[id]/import/template — the blank import
 * template (.xlsx), Arabic and English in one file.
 */
import { withErrorHandler, NotFoundError } from '@/lib/api/error-handler';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { getTenantById } from '@/services/tenant.service';
import { buildTemplate, TEMPLATE_FILE_NAME } from '@/lib/import/build-template';

export const GET = withErrorHandler(
  withSuperAdminAuth(async (_request, _ctx, routeContext) => {
    const { id } = await routeContext!.params;
    if (!(await getTenantById(id))) throw new NotFoundError('Tenant not found');
    const file = await buildTemplate();
    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${TEMPLATE_FILE_NAME}"`,
        'Cache-Control': 'no-store',
      },
    });
  })
);
