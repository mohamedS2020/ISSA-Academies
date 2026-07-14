/**
 * ISSA — Database Seed Script
 *
 * Seeds the platform DB with a test tenant, branch, admin user, and sample data.
 * Run with: npx ts-node prisma/seed.ts (or via prisma db seed)
 *
 * This script:
 *   1. Creates a super admin account
 *   2. Creates a test tenant in the platform DB
 *   3. Provisions the tenant schema
 *   4. Seeds the tenant schema with a branch, admin, captain, and sample plans
 */

import { PrismaClient as PlatformClient } from '../src/generated/platform-client';
import { PrismaClient as TenantClient } from '../src/generated/tenant-client';
import bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import path from 'path';

const SALT_ROUNDS = 12;

async function main() {
  const platformDb = new PlatformClient();

  try {
    console.log('🌊 ISSA Seed: Starting...\n');

    // ─── 1. Super Admin ───────────────────────────────────────
    console.log('→ Creating Super Admin...');
    const superAdminPassword = await bcrypt.hash('SuperAdmin@123', SALT_ROUNDS);
    const superAdmin = await platformDb.superAdmin.upsert({
      where: { phoneNumber: '+201000000000' },
      update: {},
      create: {
        name: 'ISSA Super Admin',
        phoneNumber: '+201000000000',
        passwordHash: superAdminPassword,
        isActive: true,
      },
    });
    console.log(`  ✓ Super Admin: ${superAdmin.name} (${superAdmin.phoneNumber})`);
    console.log(`  ✓ Password: SuperAdmin@123\n`);

    // ─── 2. Test Tenant ───────────────────────────────────────
    console.log('→ Creating Test Tenant...');
    const tenant = await platformDb.tenant.upsert({
      where: { slug: 'aqua-stars' },
      update: {},
      create: {
        name: 'Aqua Stars Academy',
        slug: 'aqua-stars',
        status: 'ACTIVE',
        contactName: 'Ahmed Hassan',
        contactPhone: '+201111111111',
        contactEmail: 'admin@aquastars.com',
        schemaName: 'tenant_aqua_stars',
        maxBranches: 5,
      },
    });

    await platformDb.tenantConfig.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        currency: 'EGP',
        defaultTimezone: 'Africa/Cairo',
      },
    });
    console.log(`  ✓ Tenant: ${tenant.name} (schema: ${tenant.schemaName})\n`);

    // ─── 3. Provision Tenant Schema ───────────────────────────
    console.log('→ Provisioning tenant schema...');
    // Create the schema if it doesn't exist
    await platformDb.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "${tenant.schemaName}"`
    );
    console.log(`  ✓ Schema "${tenant.schemaName}" created\n`);

    const prismaCliPath = path.resolve(
      process.cwd(),
      'node_modules',
      'prisma',
      'build',
      'index.js'
    );
    const tenantSchemaPath = path.resolve(
      process.cwd(),
      'prisma',
      'tenant-schema.prisma'
    );

    // Build a connection URL that sets the search_path to the tenant schema
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('schema', tenant.schemaName);
    const tenantDbUrl = url.toString();

    console.log(`  → Deploying migrations to "${tenant.schemaName}"...`);
    execSync(
      `node --max-old-space-size=4096 "${prismaCliPath}" migrate deploy --schema="${tenantSchemaPath}"`,
      {
        env: {
          ...process.env,
          DATABASE_URL: tenantDbUrl,
        },
      }
    );
    console.log(`  ✓ Tenant migrations applied successfully\n`);

    // ─── 4. Seed Tenant Data ──────────────────────────────────
    console.log('→ Seeding tenant data...');
    const tenantDb = new TenantClient();

    // Use a transaction with SET LOCAL to target the tenant schema
    await tenantDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL search_path = "${tenant.schemaName}"`
      );

      // Seed Branch
      console.log('  → Seeding Branch...');
      await tx.$executeRawUnsafe(`
        INSERT INTO "branches" ("id", "name", "code", "timezone", "is_active", "created_at", "updated_at")
        VALUES (
          'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          'Heliopolis Branch',
          'HELIO',
          'Africa/Cairo',
          true,
          NOW(),
          NOW()
        )
        ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name"
      `);
      const branchId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

      // Seed Tenant Admin User
      console.log('  → Seeding Tenant Admin...');
      const adminPasswordHash = await bcrypt.hash('Admin@123', SALT_ROUNDS);
      const adminUserId = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';
      await tx.$executeRawUnsafe(`
        INSERT INTO "users" ("id", "branch_id", "name", "phone_number", "password_hash", "role", "is_active", "language", "created_at", "updated_at")
        VALUES (
          '${adminUserId}',
          '${branchId}',
          'Aqua Stars Admin',
          '+201111111111',
          '${adminPasswordHash}',
          'ADMIN',
          true,
          'en',
          NOW(),
          NOW()
        )
        ON CONFLICT ("branch_id", "phone_number") DO UPDATE SET "password_hash" = EXCLUDED."password_hash", "name" = EXCLUDED."name"
      `);

      // Seed Captain User
      console.log('  → Seeding Captain (Coach)...');
      const captainPasswordHash = await bcrypt.hash('Captain@123', SALT_ROUNDS);
      const captainUserId = 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f';
      await tx.$executeRawUnsafe(`
        INSERT INTO "users" ("id", "branch_id", "name", "phone_number", "password_hash", "role", "is_active", "language", "created_at", "updated_at")
        VALUES (
          '${captainUserId}',
          '${branchId}',
          'Captain Mohamed',
          '+201222222222',
          '${captainPasswordHash}',
          'CAPTAIN',
          true,
          'en',
          NOW(),
          NOW()
        )
        ON CONFLICT ("branch_id", "phone_number") DO UPDATE SET "password_hash" = EXCLUDED."password_hash", "name" = EXCLUDED."name"
      `);

      // Seed Captain Profile
      await tx.$executeRawUnsafe(`
        INSERT INTO "captain_profiles" ("id", "user_id", "branch_id", "specialization", "payroll_type", "hourly_rate", "created_at", "updated_at")
        VALUES (
          'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f90',
          '${captainUserId}',
          '${branchId}',
          'Freestyle',
          'HOURS',
          150.00,
          NOW(),
          NOW()
        )
        ON CONFLICT ("user_id") DO UPDATE SET "specialization" = EXCLUDED."specialization", "hourly_rate" = EXCLUDED."hourly_rate"
      `);

      console.log('  ✓ Branch, Admin, and Captain seeded successfully.');
    });

    // ─── 5. Create User Phone Index ────────────────────────────
    console.log('→ Creating User Phone Index entries...');
    const adminUserId = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';
    const captainUserId = 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f';
    const branchId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

    await platformDb.userPhoneIndex.upsert({
      where: { phoneNumber_tenantId: { phoneNumber: '+201111111111', tenantId: tenant.id } },
      update: {},
      create: {
        phoneNumber: '+201111111111',
        tenantId: tenant.id,
        userId: adminUserId,
        branchId: branchId,
        role: 'ADMIN',
      },
    });
    console.log('  ✓ Admin phone index created');

    await platformDb.userPhoneIndex.upsert({
      where: { phoneNumber_tenantId: { phoneNumber: '+201222222222', tenantId: tenant.id } },
      update: {},
      create: {
        phoneNumber: '+201222222222',
        tenantId: tenant.id,
        userId: captainUserId,
        branchId: branchId,
        role: 'CAPTAIN',
      },
    });
    console.log('  ✓ Captain phone index created\n');

    await tenantDb.$disconnect();

    console.log('─────────────────────────────────────────────');
    console.log('🌊 ISSA Seed: Complete!');
    console.log('─────────────────────────────────────────────');
    console.log('\nLogin credentials:');
    console.log('  Super Admin:  +201000000000 / SuperAdmin@123');
    console.log('  Tenant Admin: +201111111111 / Admin@123 (under Aqua Stars)');
    console.log('  Captain:      +201222222222 / Captain@123 (under Aqua Stars)\n');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await platformDb.$disconnect();
  }
}

main();
