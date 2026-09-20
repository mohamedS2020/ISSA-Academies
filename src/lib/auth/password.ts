/**
 * ISSA — Password Hashing Utilities
 *
 * Wraps bcryptjs for consistent password hashing across the application.
 *
 * Usage:
 *   const hash = await hashPassword('my-password');
 *   const isMatch = await comparePassword('my-password', hash);
 *   const random = generateRandomPassword();
 */

import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

/**
 * Number of salt rounds for bcrypt hashing. Higher = slower but more secure.
 *
 * 10, not 12: `bcryptjs` is pure JS with no native bindings, so each hash burns
 * single-threaded CPU and blocks the event loop — at 12 rounds that is ~0.5–1s
 * per login, capping throughput at roughly 1–3 logins/sec. 10 rounds is ~4×
 * faster and still well above current guidance.
 *
 * Existing 12-round hashes keep verifying: bcrypt encodes its cost inside the
 * hash string, and `bcrypt.compare` reads it from there rather than from this
 * constant. Only newly-created hashes use the new cost.
 */
const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password using bcrypt.
 *
 * @param password - The plaintext password to hash
 * @returns The bcrypt hash string
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 *
 * @param password - The plaintext password to verify
 * @param hash     - The bcrypt hash to compare against
 * @returns True if the password matches the hash
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Pick one character uniformly at random from `set`, using the CSPRNG. */
function pick(set: string): string {
  return set[randomInt(set.length)];
}

/**
 * Generate a random password for admin-initiated resets.
 *
 * Password includes uppercase, lowercase, digits, and special characters to
 * meet complexity requirements.
 *
 * ⚠️ Every random draw here MUST come from `node:crypto` — this function mints
 * real credentials (academy Admin passwords during tenant provisioning, and
 * admin-initiated resets via POST /api/auth/password-reset). `Math.random()` is
 * a seeded PRNG whose output is predictable from observed values, so it must
 * never be used here. `randomInt(max)` is uniform over [0, max) and rejection-
 * samples internally, so there is no modulo bias either.
 *
 * @param length - Password length (default 12)
 * @returns A random password string
 */
export function generateRandomPassword(length = 12): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O (ambiguous)
  const lowercase = 'abcdefghjkmnpqrstuvwxyz'; // No i, l, o (ambiguous)
  const digits = '23456789'; // No 0, 1 (ambiguous)
  const special = '!@#$%&*';
  const all = uppercase + lowercase + digits + special;

  // Ensure at least one of each type
  const required = [
    pick(uppercase),
    pick(lowercase),
    pick(digits),
    pick(special),
  ];

  // Fill remaining characters
  const remaining = Array.from({ length: length - required.length }, () =>
    pick(all)
  );

  // Shuffle all characters together — Fisher-Yates, also CSPRNG-driven. A
  // predictable shuffle would leak the "one of each class" positions even if
  // the characters themselves were drawn securely.
  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

/**
 * Derive a simple onboarding password from a phone number: its last 6 digits.
 *
 * Used for auto-provisioned accounts (trainee/captain) so staff can hand the
 * login to the member without a random string. Non-digit characters (+, spaces,
 * dashes, parentheses) are stripped first. Falls back to a random password if
 * the number somehow has fewer than 6 digits, so an account is never left with
 * a trivially short secret. Members can change it later via
 * POST /api/auth/change-password.
 *
 * ⚠️ The phone number is also the login identifier, so this password is
 * effectively public — acceptable for low-sensitivity onboarding, but staff
 * should encourage members to change it.
 *
 * @param phoneNumber - The account's phone number (any format)
 * @returns The last 6 digits, or a random password as a fallback
 */
export function passwordFromPhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(-6) : generateRandomPassword();
}
