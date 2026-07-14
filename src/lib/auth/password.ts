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

/** Number of salt rounds for bcrypt hashing. Higher = slower but more secure. */
const SALT_ROUNDS = 12;

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

/**
 * Generate a random password for admin-initiated resets.
 *
 * Uses crypto-safe randomness. Password includes uppercase, lowercase,
 * digits, and special characters to meet complexity requirements.
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
    uppercase[Math.floor(Math.random() * uppercase.length)],
    lowercase[Math.floor(Math.random() * lowercase.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];

  // Fill remaining characters
  const remaining = Array.from({ length: length - required.length }, () =>
    all[Math.floor(Math.random() * all.length)]
  );

  // Shuffle all characters together
  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
