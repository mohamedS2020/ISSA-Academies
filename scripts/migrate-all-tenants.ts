/**
 * ISSA — Migrate All Existing Tenant Schemas
 *
 * When a new migration is added (e.g. `npx prisma migrate dev --schema=prisma/tenant-schema.prisma`),
 * only NEW tenants (provisioned after that migration) get it automatically.
 * Already-provisioned tenants are not touched — their schemas sit at the
 * previous migration version.
 *
 * This script runs `prisma migrate deploy` against every ACTIVE tenant
 * schema in the platform DB, bringing all of them up to the latest
 * migration in prisma/migrations/.
 *
 * Run this ONCE after every new tenant-schema migration you create:
 *
 *   npm run migrate:tenants
 *
 * Safe to re-run — `migrate deploy` is idempotent (it skips already-applied
 * migrations, recorded per-schema in each schema's own _prisma_migrations table).
 */

import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { platformPrisma } from '../src/lib/db/platform-client';

const execAsync = promisify(exec);

const tenantSchemaPath = path.resolve(process.cwd(), 'prisma', 'tenant-schema.prisma');
const prismaCliPath = path.resolve(
  process.cwd(),
  'node_modules',
  'prisma',
  'build',
  'index.js'
);

async function migrateSchema(schemaName: string): Promise<void> {
  const baseUrl = new URL(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!);
  baseUrl.searchParams.set('schema', schemaName);
  const tenantDbUrl = baseUrl.toString();

  // Set BOTH database URLs to the schema-scoped connection — if only
  // DATABASE_URL is set, the Prisma CLI subprocess's own .env reload will
  // restore DIRECT_DATABASE_URL from disk, pointing migrations at the wrong
  // schema (the bug this explicitly avoids).
  const runEnv = { ...process.env };
  runEnv.DATABASE_URL = tenantDbUrl;
  runEnv.DIRECT_DATABASE_URL = tenantDbUrl;

  try {
    const { stdout } = await execAsync(
      `node "${prismaCliPath}" migrate deploy --schema="${tenantSchemaPath}"`,
      { env: runEnv }
    );
    const applied = stdout.match(/Applying migration `(.+)`/g) ?? [];
    if (applied.length > 0) {
      console.log(`  ✔ ${schemaName}: applied ${applied.length} migration(s)`);
      applied.forEach((m) => console.log(`    - ${m.replace('Applying migration ', '').replace(/`/g, '')}`));
    } else {
      console.log(`  ✔ ${schemaName}: already up to date`);
    }
  } catch (err: unknown) {
    const e = err as Error & { stderr?: string; stdout?: string };
    console.error(`  ✗ ${schemaName}: FAILED`);
    console.error('    stderr:', e.stderr);
    throw err;
  }
}

async function main() {
  console.log('Fetching all active tenants from platform DB...\n');

  const tenants = await platformPrisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, schemaName: true },
    orderBy: { createdAt: 'asc' },
  });

  if (tenants.length === 0) {
    console.log('No active tenants found — nothing to migrate.');
    return;
  }

  console.log(`Found ${tenants.length} active tenant(s):\n`);

  let succeeded = 0;
  let failed = 0;

  for (const tenant of tenants) {
    console.log(`→ ${tenant.name} (${tenant.schemaName})`);
    try {
      await migrateSchema(tenant.schemaName);
      succeeded++;
    } catch {
      failed++;
    }
  }

  console.log(`\n─────────────────────────────────`);
  console.log(`Done. ${succeeded} succeeded, ${failed} failed.`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(() => platformPrisma.$disconnect());
