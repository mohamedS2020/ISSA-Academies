/**
 * Database Seed
 *
 * Seeds ONLY the platform Super Admin. No tenants, branches, or other users are
 * created — academies and their staff are provisioned afterwards through the
 * Super Admin UI.
 *
 * Run with:
 *   SEED_SUPER_ADMIN_NAME="…" SEED_SUPER_ADMIN_PHONE="+20…" \
 *   SEED_SUPER_ADMIN_PASSWORD="…" npx tsx prisma/seed.ts
 *
 * (or set the three variables in .env.local first).
 *
 * Idempotent: re-running upserts the Super Admin to exactly these values
 * (including resetting the password), so the seed always leaves a known state.
 *
 * ⚠️ CREDENTIALS COME FROM THE ENVIRONMENT, NEVER FROM THIS FILE.
 *
 * This file used to hardcode the Super Admin's phone and password, and it is
 * committed to a PUBLIC repository — so the credentials for the most privileged
 * account on the platform (one that can suspend or irreversibly delete any
 * academy) were readable by anyone. Removing them from this file does NOT remove
 * them from git history: the password that was here must be treated as public
 * and changed. See hardening plan §34.
 */

import { PrismaClient as PlatformClient } from '../src/generated/platform-client';
// Use the app's own hasher rather than calling bcrypt with a duplicated cost
// constant — the two had already drifted apart once (the app moved to 10 rounds
// while this file still said 12). Importing it means they cannot drift again.
import { hashPassword } from '../src/lib/auth/password';

/** The Super Admin can delete any academy, so demand a real password. */
const MIN_PASSWORD_LENGTH = 12;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. The seed reads the Super Admin's credentials from the ` +
        'environment and will not fall back to a default — a default would be a ' +
        'known password on the most privileged account.'
    );
  }
  return value;
}

function readSuperAdmin() {
  const name = requireEnv('SEED_SUPER_ADMIN_NAME');
  const phoneNumber = requireEnv('SEED_SUPER_ADMIN_PHONE');
  const password = requireEnv('SEED_SUPER_ADMIN_PASSWORD');

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_SUPER_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }
  if (!/^\+?[0-9\s-]{7,20}$/.test(phoneNumber)) {
    throw new Error('SEED_SUPER_ADMIN_PHONE is not a valid phone number.');
  }

  return { name, phoneNumber, password };
}

async function main() {
  // Validate BEFORE opening a connection, so a misconfigured run fails fast and
  // touches nothing.
  const superAdminInput = readSuperAdmin();
  const db = new PlatformClient();

  try {
    console.log('Seed — Super Admin only\n');

    const passwordHash = await hashPassword(superAdminInput.password);

    const superAdmin = await db.superAdmin.upsert({
      where: { phoneNumber: superAdminInput.phoneNumber },
      update: {
        name: superAdminInput.name,
        passwordHash,
        isActive: true,
      },
      create: {
        name: superAdminInput.name,
        phoneNumber: superAdminInput.phoneNumber,
        passwordHash,
        isActive: true,
      },
    });

    // Name only — never echo the phone number or password to logs.
    console.log(`  ✓ Super Admin ready: ${superAdmin.name}`);
    console.log('\n─────────────────────────────────────────────');
    console.log('Seed complete. Log in as the Super Admin, then create academies from the UI.');
    console.log('─────────────────────────────────────────────\n');
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
