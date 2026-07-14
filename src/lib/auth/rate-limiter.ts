/**
 * ISSA — Rate Limiter
 *
 * In-memory sliding window rate limiter for login and sensitive endpoints.
 * Uses a simple Map-based store — suitable for single-instance deployments.
 * For multi-instance deployments, replace with Redis-backed implementation.
 *
 * Usage:
 *   const loginLimiter = createRateLimiter({
 *     windowMs: 15 * 60 * 1000, // 15 minutes
 *     maxAttempts: 5,
 *   });
 *
 *   export const POST = withErrorHandler(async (request) => {
 *     const key = getClientKey(request); // e.g. IP + phone
 *     const result = loginLimiter.check(key);
 *     if (!result.allowed) {
 *       return tooManyRequestsResponse(
 *         `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`
 *       );
 *     }
 *     // proceed with login...
 *   });
 */

interface RateLimiterOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum number of attempts within the window */
  maxAttempts: number;
}

interface RateLimitEntry {
  attempts: number;
  windowStart: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface RateLimiter {
  check: (key: string) => RateLimitResult;
  reset: (key: string) => void;
  cleanup: () => void;
}

/**
 * Create a rate limiter with the specified options.
 *
 * The limiter uses a sliding window approach:
 *   - Each key (e.g. IP address) gets a counter and window start time
 *   - If the window has expired, the counter resets
 *   - If the counter exceeds maxAttempts, the request is rejected
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup to prevent memory leaks
  // Runs every minute to remove expired entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.windowStart > options.windowMs) {
        store.delete(key);
      }
    }
  }, 60_000);

  // Allow garbage collection of the interval
  if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref();
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(key);

      // No existing entry or window expired → start fresh
      if (!entry || now - entry.windowStart > options.windowMs) {
        store.set(key, { attempts: 1, windowStart: now });
        return {
          allowed: true,
          remaining: options.maxAttempts - 1,
          retryAfterSeconds: 0,
        };
      }

      // Within window — check limit
      entry.attempts++;

      if (entry.attempts > options.maxAttempts) {
        const retryAfterMs = options.windowMs - (now - entry.windowStart);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        };
      }

      return {
        allowed: true,
        remaining: options.maxAttempts - entry.attempts,
        retryAfterSeconds: 0,
      };
    },

    reset(key: string): void {
      store.delete(key);
    },

    cleanup(): void {
      clearInterval(cleanupInterval);
      store.clear();
    },
  };
}

// ─── Pre-configured Limiters ────────────────────────────────

/** Login rate limiter: 5 attempts per 15 minutes */
export const loginRateLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS ?? '900000', 10),
  maxAttempts: parseInt(process.env.RATE_LIMIT_LOGIN_MAX ?? '5', 10),
});

/** Password reset rate limiter: 3 attempts per 30 minutes */
export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000,
  maxAttempts: 3,
});

/** General API rate limiter: 100 requests per minute */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxAttempts: 100,
});

// ─── Helpers ────────────────────────────────────────────────

/**
 * Build a rate limit key from the request.
 * Uses IP address + optional discriminator (e.g. phone number).
 */
export function getRateLimitKey(request: Request, discriminator?: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0].trim() ?? request.headers.get('x-real-ip') ?? 'unknown';

  if (discriminator) {
    return `${ip}:${discriminator}`;
  }
  return ip;
}
