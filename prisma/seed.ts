/**
 * ISSA — Database Seed
 *
 * Seeds ONLY the platform Super Admin. No tenants, branches, or other users are
 * created — academies and their staff are provisioned afterwards through the
 * Super Admin UI.
 *
 * Run with:  npx tsx prisma/seed.ts
 *
 * Idempotent: re-running upserts the Super Admin to exactly the values below
 * (including resetting the password), so the seed always leaves a known state.
 */

import { PrismaClient as PlatformClient } from '../src/generated/platform-client';
import bcrypt from 'bcryptjs';

// Matches src/lib/auth/password.ts so the app's login (bcrypt.compare) accepts it.
const SALT_ROUNDS = 12;

const SUPER_ADMIN = {
  name: 'Mohamed Sharaf',
  phoneNumber: '+201285727056',
  password: 'FakesKxT2002@egypt.com',
};

async function main() {
  const db = new PlatformClient();

  try {
    console.log('🌊 ISSA Seed — Super Admin only\n');

    const passwordHash = await bcrypt.hash(SUPER_ADMIN.password, SALT_ROUNDS);

    const superAdmin = await db.superAdmin.upsert({
      where: { phoneNumber: SUPER_ADMIN.phoneNumber },
      update: {
        name: SUPER_ADMIN.name,
        passwordHash,
        isActive: true,
      },
      create: {
        name: SUPER_ADMIN.name,
        phoneNumber: SUPER_ADMIN.phoneNumber,
        passwordHash,
        isActive: true,
      },
    });

    console.log(`  ✓ Super Admin ready: ${superAdmin.name} (${superAdmin.phoneNumber})`);
    console.log('\n─────────────────────────────────────────────');
    console.log('Seed complete. Log in as the Super Admin, then create academies from the UI.');
    console.log('─────────────────────────────────────────────\n');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

main();
