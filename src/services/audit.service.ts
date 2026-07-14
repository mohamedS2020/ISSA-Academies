/**
 * ISSA — Audit Logging Service
 *
 * Logs all write operations on sensitive entities:
 *   - Financial records (receipts, transactions, expenses, payroll)
 *   - Subscriptions (create, renew, status change)
 *   - Attendance records
 *   - User privilege changes
 *
 * Audit logs are stored in the tenant's schema within the audit_logs table.
 * They are never deleted — only archived per the retention policy.
 */

import type { TransactionClient } from '@/lib/db/tenant-client';
import type { AuditAction } from '@/types';

export interface AuditLogEntry {
  branchId: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Write an audit log entry within an existing transaction.
 *
 * ⚠️ Always call this INSIDE the same transaction as the data change.
 *    If the data change rolls back, the audit log rolls back too,
 *    keeping them in sync.
 *
 * @param tx    - The Prisma transaction client (from withTenantContext)
 * @param entry - The audit log entry to write
 *
 * @example
 * await withTenantContext(tenantId, async (tx) => {
 *   const sub = await tx.traineeSubscription.create({ data: { ... } });
 *   await writeAuditLog(tx, {
 *     branchId: ctx.branchId,
 *     userId: ctx.userId,
 *     action: 'CREATE',
 *     entityType: 'trainee_subscription',
 *     entityId: sub.id,
 *     newValues: sub,
 *   });
 * });
 */
export async function writeAuditLog(
  tx: TransactionClient,
  entry: AuditLogEntry
): Promise<void> {
  await tx.auditLog.create({
    data: {
      branchId: entry.branchId,
      userId: entry.userId,
      action: entry.action as any,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValues: (entry.oldValues ?? undefined) as any,
      newValues: (entry.newValues ?? undefined) as any,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

/**
 * Build a diff of changed fields between old and new values.
 * Only includes fields that actually changed.
 * Useful for UPDATE audit logs to show exactly what was modified.
 */
export function buildAuditDiff(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
): { old: Record<string, unknown>; new: Record<string, unknown> } | null {
  const changedOld: Record<string, unknown> = {};
  const changedNew: Record<string, unknown> = {};
  let hasChanges = false;

  for (const key of Object.keys(newValues)) {
    if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
      changedOld[key] = oldValues[key];
      changedNew[key] = newValues[key];
      hasChanges = true;
    }
  }

  return hasChanges ? { old: changedOld, new: changedNew } : null;
}

/**
 * Extract client IP address from the request.
 * Checks common headers for proxied requests.
 */
export function extractClientIp(request: Request): string | null {
  const headers = request.headers;

  // Check forwarded headers (from reverse proxy / load balancer)
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return null;
}
