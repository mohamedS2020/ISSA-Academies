/**
 * Super Admin: one Marketing Lead
 *
 * PATCH  /api/superadmin/leads/[id] — change its status and/or notes
 * DELETE /api/superadmin/leads/[id] — delete it permanently
 *
 * Requires SUPER_ADMIN role.
 */

import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { noContentResponse, successResponse } from '@/lib/api/response';
import { updateLeadSchema } from '@/schemas/lead.schema';
import { deleteLead, updateLead } from '@/services/lead.service';

const idSchema = z.uuid();

export const PATCH = withErrorHandler(
  withSuperAdminAuth(async (request, _ctx, routeContext) => {
    const id = idSchema.parse((await routeContext!.params).id);
    const changes = updateLeadSchema.parse(await request.json());
    return successResponse(await updateLead(id, changes));
  })
);

export const DELETE = withErrorHandler(
  withSuperAdminAuth(async (_request, _ctx, routeContext) => {
    const id = idSchema.parse((await routeContext!.params).id);
    await deleteLead(id);
    return noContentResponse();
  })
);
