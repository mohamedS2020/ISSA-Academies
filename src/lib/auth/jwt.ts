/**
 * ISSA — JWT Token Utilities
 *
 * Generates and verifies access and refresh tokens with tenant-aware claims.
 *
 * Token claims include: userId, role, tenantId?, branchId?
 * - Access tokens: short-lived (default 15m, 7d with rememberMe)
 * - Refresh tokens: longer-lived (default 7d, 30d with rememberMe)
 *
 * Uses separate secrets for access and refresh tokens to prevent
 * a leaked access token from being used to generate new tokens.
 */

import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import type { UserRole, JWTPayload } from '@/types';

// ─── Configuration ──────────────────────────────────────────

// The public placeholder secrets shipped in .env.example. If production is ever
// configured with one of these (or a too-short secret), anyone could forge
// tokens — so we fail closed in production.
const WEAK_SECRETS = new Set([
  'issa-access-secret-change-me-in-production',
  'issa-refresh-secret-change-me-in-production',
]);

function assertStrongSecret(secret: string, name: string): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (WEAK_SECRETS.has(secret) || secret.length < 32) {
    throw new Error(
      `${name} is weak or still set to the public example value. ` +
        'Set a strong random secret (32+ chars) in production.'
    );
  }
}

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET environment variable is not set');
  }
  assertStrongSecret(secret, 'JWT_ACCESS_SECRET');
  return secret;
}

function getRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is not set');
  }
  assertStrongSecret(secret, 'JWT_REFRESH_SECRET');
  return secret;
}

// Access tokens are ALWAYS short-lived — this is what makes refresh-time
// revocation effective (the DB is re-checked on every refresh, ~every 15m).
// "Remember me" only extends the REFRESH token, keeping the user signed in
// across restarts while access re-validates frequently.
const DEFAULT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY ?? '15m';
const DEFAULT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY ?? '7d';
const REMEMBER_ME_REFRESH_EXPIRY =
  process.env.JWT_REMEMBER_ME_EXPIRY ?? '30d';

/** The access-token lifetime string (always short). */
export function getAccessExpiry(): string {
  return DEFAULT_ACCESS_EXPIRY;
}

/** The refresh-token lifetime string (longer with rememberMe). */
export function getRefreshExpiry(rememberMe: boolean): string {
  return rememberMe ? REMEMBER_ME_REFRESH_EXPIRY : DEFAULT_REFRESH_EXPIRY;
}

/** Convert a JWT duration string ("15m", "7d", "30d", "3600s") to seconds. */
export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!match) return 900; // safe default: 15 minutes
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return n * mult;
}

// ─── Token Types ────────────────────────────────────────────

/** Type discriminator embedded in the token to prevent misuse */
export type TokenType = 'access' | 'refresh';

export interface TokenPayload extends JWTPayload {
  type: TokenType;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ─── Token Generation ───────────────────────────────────────

/**
 * Generate an access token with the user's claims.
 *
 * @param payload    - User claims (userId, role, tenantId, branchId)
 * @param rememberMe - If true, extends the expiry to 7 days
 * @returns Signed JWT access token
 */
export function generateAccessToken(
  payload: JWTPayload,
  _rememberMe = false // access tokens are always short-lived; kept for call-site compatibility
): string {
  const secret = getAccessSecret();
  const expiresIn = DEFAULT_ACCESS_EXPIRY;

  const tokenPayload: Record<string, unknown> = {
    userId: payload.userId,
    role: payload.role,
    type: 'access' as TokenType,
  };

  // Only include tenant/branch claims when present
  if (payload.tenantId) tokenPayload.tenantId = payload.tenantId;
  if (payload.branchId) tokenPayload.branchId = payload.branchId;

  return jwt.sign(tokenPayload, secret, {
    expiresIn,
    issuer: 'issa',
    subject: payload.userId,
  } as SignOptions);
}

/**
 * Generate a refresh token with minimal claims.
 *
 * @param payload    - User claims
 * @param rememberMe - If true, extends the expiry to 30 days
 * @returns Signed JWT refresh token
 */
export function generateRefreshToken(
  payload: JWTPayload,
  rememberMe = false
): string {
  const secret = getRefreshSecret();
  const expiresIn = rememberMe
    ? REMEMBER_ME_REFRESH_EXPIRY
    : DEFAULT_REFRESH_EXPIRY;

  const tokenPayload: Record<string, unknown> = {
    userId: payload.userId,
    role: payload.role,
    type: 'refresh' as TokenType,
  };

  if (payload.tenantId) tokenPayload.tenantId = payload.tenantId;
  if (payload.branchId) tokenPayload.branchId = payload.branchId;

  return jwt.sign(tokenPayload, secret, {
    expiresIn,
    issuer: 'issa',
    subject: payload.userId,
  } as SignOptions);
}

/**
 * Generate both access and refresh tokens.
 */
export function generateTokenPair(
  payload: JWTPayload,
  rememberMe = false
): TokenPair {
  return {
    accessToken: generateAccessToken(payload, rememberMe),
    refreshToken: generateRefreshToken(payload, rememberMe),
  };
}

// ─── Token Verification ────────────────────────────────────

/**
 * Verify and decode an access token.
 *
 * @param token - The JWT string to verify
 * @returns Decoded token payload
 * @throws Error if the token is invalid, expired, or not an access token
 */
export function verifyAccessToken(token: string): TokenPayload {
  const secret = getAccessSecret();
  const decoded = jwt.verify(token, secret, {
    issuer: 'issa',
    algorithms: ['HS256'], // pin the algorithm — reject alg confusion / alg:none
  }) as JwtPayload & TokenPayload;

  if (decoded.type !== 'access') {
    throw new Error('Invalid token type: expected access token');
  }

  return {
    userId: decoded.userId,
    role: decoded.role as UserRole,
    tenantId: decoded.tenantId,
    branchId: decoded.branchId,
    type: decoded.type,
    iat: decoded.iat,
    exp: decoded.exp,
  };
}

/**
 * Verify and decode a refresh token.
 *
 * @param token - The JWT string to verify
 * @returns Decoded token payload
 * @throws Error if the token is invalid, expired, or not a refresh token
 */
export function verifyRefreshToken(token: string): TokenPayload {
  const secret = getRefreshSecret();
  const decoded = jwt.verify(token, secret, {
    issuer: 'issa',
    algorithms: ['HS256'], // pin the algorithm — reject alg confusion / alg:none
  }) as JwtPayload & TokenPayload;

  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type: expected refresh token');
  }

  return {
    userId: decoded.userId,
    role: decoded.role as UserRole,
    tenantId: decoded.tenantId,
    branchId: decoded.branchId,
    type: decoded.type,
    iat: decoded.iat,
    exp: decoded.exp,
  };
}

/**
 * Decode a token without verifying — for reading claims on expired tokens.
 * ⚠️ Only use this for non-security-critical operations (e.g. logging).
 */
export function decodeTokenUnsafe(token: string): TokenPayload | null {
  try {
    const decoded = jwt.decode(token) as TokenPayload | null;
    return decoded;
  } catch {
    return null;
  }
}
