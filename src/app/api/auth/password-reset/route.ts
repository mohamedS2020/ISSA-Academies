/**
 * ISSA — Password Reset API Route
 *
 * POST /api/auth/password-reset
 *
 * Admin-initiated password reset. Generates a new random password
 * for a target user and returns it once for the admin to share.
 *
 * Requires: ADMIN role
 * Request:  { userId: string }
 * Response: { newPassword: string, userId: string }
 *
 * ⚠️ The new password is only returned ONCE. It is never stored
 *    in plaintext or logged. The admin must share it with the user
 *    immediately.
 */

import { passwordResetSchema } from '@/schemas/auth.schema';
import { hashPassword, generateRandomPassword } from '@/lib/auth/password';
import { withAuth, withStaffAuth } from '@/lib/auth/middleware';
import { withErrorHandler, NotFoundError } from '@/lib/api/error-handler';
import { successResponse } from '@/lib/api/response';
import { withTenantContext } from '@/lib/db/tenant-client';
import { writeAuditLog } from '@/services/audit.service';
import {
  passwordResetRateLimiter,
  getRateLimitKey,
} from '@/lib/auth/rate-limiter';
import { tooManyRequestsResponse } from '@/lib/api/response';
import { UserRole } from '@/types';

export const POST = withErrorHandler(
  withAuth(
    async (request, ctx) => {
      // Rate limit
      const rateLimitKey = getRateLimitKey(request, 'password-reset');
      const rateLimitResult = passwordResetRateLimiter.check(rateLimitKey);
      if (!rateLimitResult.allowed) {
        return tooManyRequestsResponse(
          `Too many reset attempts. Try again in ${rateLimitResult.retryAfterSeconds} seconds.`
        );
      }

      const body = await request.json();
      const { userId } = passwordResetSchema.parse(body);

      // Generate new password
      const newPassword = generateRandomPassword(12);
      const newHash = await hashPassword(newPassword);

      // Update user's password in tenant DB
      await withTenantContext(ctx.tenantId, async (tx) => {
        // Verify user exists and is in the same branch (or admin has access)
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, branchId: true, role: true },
        });

        if (!user) {
          throw new NotFoundError('User not found');
        }

        // Branch isolation: if the admin has a specific branch, they can only
        // reset passwords for users in their branch
        if (ctx.branchId && user.branchId !== ctx.branchId) {
          throw new NotFoundError('User not found');
        }

        // Update password
        await tx.user.update({
          where: { id: userId },
          data: { passwordHash: newHash },
        });

        // Audit log
        await writeAuditLog(tx, {
          branchId: user.branchId,
          userId: ctx.userId,
          action: 'PASSWORD_RESET' as never,
          entityType: 'user',
          entityId: userId,
          newValues: { resetBy: ctx.userId, targetUser: user.name },
        });
      });

      return successResponse({
        userId,
        newPassword, // Returned ONCE — never stored in plaintext
      });
    },
    { roles: [UserRole.ADMIN] }
  )
);
