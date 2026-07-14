/**
 * ISSA — Database Module Barrel Export
 *
 * Provides a single import point for all database utilities:
 *   import { platformPrisma, withTenantContext, resolveTenantContext } from '@/lib/db';
 */

export { platformPrisma } from './platform-client';
export {
  tenantPrisma,
  withTenantContext,
  withTenantRead,
  type TransactionClient,
} from './tenant-client';
export {
  resolveTenantContext,
  buildRequestContext,
  TenantResolutionError,
  type TenantContext,
} from './tenant-resolver';
export {
  sanitizeSchemaName,
  getTenantSchemaName,
  provisionTenantSchema,
  dropTenantSchema,
} from './migration-runner';
