/**
 * ISSA — Platform Database Client (Singleton)
 *
 * Provides a single Prisma client instance for the platform database
 * (tenants, super admins, tenant configs). This client always targets
 * the default 'public' schema.
 *
 * Uses the standard singleton pattern to avoid creating multiple
 * PrismaClient instances in development (hot reload).
 */

import { PrismaClient } from '@/generated/platform-client';

const globalForPrisma = globalThis as unknown as {
  platformPrisma: PrismaClient | undefined;
};

export const platformPrisma =
  globalForPrisma.platformPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.platformPrisma = platformPrisma;
}
