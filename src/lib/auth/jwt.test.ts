/**
 * JWT secret strength — guards the published-placeholder denylist.
 *
 * Production must refuse to start with any placeholder secret that has ever
 * been published, because a known secret lets anyone forge tokens.
 *
 * This list is deliberately independent of the one in jwt.ts. If someone
 * removes an entry there — the older ones look exactly like leftover branding,
 * and removing them nearly happened during the de-branding pass — this test
 * still expects it to be rejected, and fails. That is the point.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { generateAccessToken, generateRefreshToken } from './jwt';
import { UserRole } from '@/types';

/** Every placeholder ever shipped in .env.example. Append only. */
const PUBLISHED_ACCESS_PLACEHOLDERS = [
  'change-me-to-a-random-access-secret-of-32-plus-chars',
  'issa-access-secret-change-me-in-production',
];
const PUBLISHED_REFRESH_PLACEHOLDERS = [
  'change-me-to-a-random-refresh-secret-of-32-plus-chars',
  'issa-refresh-secret-change-me-in-production',
];

const STRONG = 'x7Q2vN9pL4mK8rT1wY6zA3bC5dE0fG2hJ4kM6nP8qR';
const payload = { userId: 'u1', role: UserRole.ADMIN, tenantId: 't1', branchId: 'b1' };

// NODE_ENV is typed read-only by Next.js; tests need to flip it.
const env = process.env as Record<string, string | undefined>;
const saved = {
  NODE_ENV: env.NODE_ENV,
  JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
};

afterEach(() => {
  Object.assign(env, saved);
});

describe('production refuses published placeholder secrets', () => {
  it.each(PUBLISHED_ACCESS_PLACEHOLDERS)('rejects access secret %s', (secret) => {
    env.NODE_ENV = 'production';
    env.JWT_ACCESS_SECRET = secret;
    expect(() => generateAccessToken(payload)).toThrow(/weak|example/i);
  });

  it.each(PUBLISHED_REFRESH_PLACEHOLDERS)('rejects refresh secret %s', (secret) => {
    env.NODE_ENV = 'production';
    env.JWT_REFRESH_SECRET = secret;
    expect(() => generateRefreshToken(payload)).toThrow(/weak|example/i);
  });

  it('rejects a secret shorter than 32 characters', () => {
    env.NODE_ENV = 'production';
    env.JWT_ACCESS_SECRET = 'too-short-secret';
    expect(() => generateAccessToken(payload)).toThrow(/weak|example/i);
  });

  it('accepts a strong random secret', () => {
    env.NODE_ENV = 'production';
    env.JWT_ACCESS_SECRET = STRONG;
    expect(() => generateAccessToken(payload)).not.toThrow();
  });
});

describe('outside production', () => {
  it('allows a placeholder, so local development works out of the box', () => {
    env.NODE_ENV = 'development';
    env.JWT_ACCESS_SECRET = PUBLISHED_ACCESS_PLACEHOLDERS[0];
    expect(() => generateAccessToken(payload)).not.toThrow();
  });
});
