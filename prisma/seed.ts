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
// Use the app's own hasher rather than calling bcrypt with a duplicated cost
// constant — the two had already drifted apart once (the app moved to 10 rounds
// while this file still said 12). Importing it means they cannot drift again.
import { hashPassword } from '../src/lib/auth/password';

const SUPER_ADMIN = {
  name: 'Mohamed Sharaf',
  phoneNumber: '+201285727056',
  password: 'FakesKxT2002@egypt.com',
};

async function main() {
  const db = new PlatformClient();

  try {
    console.log('🌊 ISSA Seed — Super Admin only\n');

    const passwordHash = await hashPassword(SUPER_ADMIN.password);

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
