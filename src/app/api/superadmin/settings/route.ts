/**
 * Super Admin: Platform Settings
 *
 * GET /api/superadmin/settings — current settings, plus whether email
 *                                 sending is configured on the server
 * PUT /api/superadmin/settings — replace them
 *
 * Today there is one: the address that receives an email for every new lead.
 * Requires SUPER_ADMIN role.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { isEmailConfigured } from '@/lib/email/send-email';
import { platformSettingsSchema } from '@/schemas/lead.schema';
import { getPlatformSettings, updatePlatformSettings } from '@/services/lead.service';

export const GET = withErrorHandler(
  withSuperAdminAuth(async () => {
    const settings = await getPlatformSettings();
    return successResponse({ ...settings, emailConfigured: isEmailConfigured() });
  })
);

export const PUT = withErrorHandler(
  withSuperAdminAuth(async (request) => {
    const input = platformSettingsSchema.parse(await request.json());
    const settings = await updatePlatformSettings(input);
    return successResponse({ ...settings, emailConfigured: isEmailConfigured() });
  })
);
