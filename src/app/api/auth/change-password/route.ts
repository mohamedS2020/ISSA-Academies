/**
 * ISSA — Change Password API Route
 *
 * POST /api/auth/change-password
 *
 * Self-service password change. Requires the user to provide
 * their current password and a new password. Available to all roles.
 *
 * Request:  { currentPassword, newPassword, confirmPassword }
 * Response: { message: string }
 */

import { changePasswordSchema } from '@/schemas/auth.schema';
import { comparePassword, hashPassword } from '@/lib/auth/password';
import { withAuth } from '@/lib/auth/middleware';
import {
  withErrorHandler,
  BadRequestError,
} from '@/lib/api/error-handler';
import { successResponse } from '@/lib/api/response';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { writeAuditLog } from '@/services/audit.service';
import { UserRole } from '@/types';

export const POST = withErrorHandler(
  withAuth(async (request, ctx) => {
    const body = await request.json();
    const input = changePasswordSchema.parse(body);

    // Super admin changes password in platform DB
    if (ctx.role === UserRole.SUPER_ADMIN) {
      const superAdmin = await platformPrisma.superAdmin.findUnique({
        where: { id: ctx.userId },
        select: { passwordHash: true },
      });

      if (!superAdmin) {
        throw new BadRequestError('User not found');
      }

      const isValid = await comparePassword(
        input.currentPassword,
        superAdmin.passwordHash
      );
      if (!isValid) {
        throw new BadRequestError('Current password is incorrect');
      }

      const newHash = await hashPassword(input.newPassword);
      await platformPrisma.superAdmin.update({
        where: { id: ctx.userId },
        data: { passwordHash: newHash },
      });

      return successResponse({ message: 'Password changed successfully' });
    }

    // Tenant user changes password in tenant DB
    await withTenantContext(ctx.tenantId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: ctx.userId },
        select: { passwordHash: true, branchId: true },
      });

      if (!user) {
        throw new BadRequestError('User not found');
      }

      const isValid = await comparePassword(
        input.currentPassword,
        user.passwordHash
      );
      if (!isValid) {
        throw new BadRequestError('Current password is incorrect');
      }

      const newHash = await hashPassword(input.newPassword);
      await tx.user.update({
        where: { id: ctx.userId },
        data: { passwordHash: newHash },
      });

      // Audit log
      await writeAuditLog(tx, {
        branchId: user.branchId,
        userId: ctx.userId,
        action: 'UPDATE' as never,
        entityType: 'user',
        entityId: ctx.userId,
        newValues: { action: 'password_changed' },
      });
    });

    return successResponse({ message: 'Password changed successfully' });
  })
);
