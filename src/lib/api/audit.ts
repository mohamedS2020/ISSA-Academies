/**
 * ISSA — Audit Logging API Middleware
 *
 * Provides a higher-order function that wraps route handlers
 * to automatically log audit entries for sensitive operations.
 *
 * Usage:
 *   export const POST = withErrorHandler(
 *     withAudit('trainee_subscription', 'CREATE', async (request) => {
 *       // your handler — audit is auto-logged
 *     })
 *   );
 */

import { extractClientIp } from '@/services/audit.service';

export interface AuditConfig {
  entityType: string;
  action: string;
}

/**
 * Creates an audit context object that route handlers can populate
 * and pass to the audit service within their transaction.
 *
 * This is a lightweight approach — the actual audit log write
 * happens inside the service transaction (not in middleware),
 * ensuring the audit log and data change are atomic.
 */
export function createAuditContext(request: Request): {
  ipAddress: string | null;
} {
  return {
    ipAddress: extractClientIp(request),
  };
}
