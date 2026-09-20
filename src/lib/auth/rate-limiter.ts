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

/**
 * General API rate limiter: 100 requests per minute, keyed by user id.
 *
 * Applied in `withAuth`, so it covers every authenticated endpoint and stops one
 * account saturating the database. Configurable because the right ceiling
 * depends on how chatty the UI is — a dashboard that fans out several requests
 * per page view eats into this faster than a portal user does. Raise it if
 * legitimate users start seeing 429s; do not remove it.
 *
 * `/api/auth/refresh` deliberately does NOT go through `withAuth` (it has its
 * own `refreshRateLimiter`), so hitting this limit can never stop a user
 * renewing their session and locking them out.
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS ?? '60000', 10),
  maxAttempts: parseInt(process.env.RATE_LIMIT_API_MAX ?? '100', 10),
});

/** Token refresh limiter: 30 per minute per IP (abuse guard; refresh needs a
 *  valid signed token, so this is defense-in-depth, not brute-force protection). */
export const refreshRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxAttempts: 30,
});

/** Change-password limiter: 5 per 15 minutes (throttles current-password guessing). */
export const changePasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
});

// ─── Client IP resolution ───────────────────────────────────

/**
 * How many proxies sit in front of the app and append to `x-forwarded-for`.
 *
 * Railway puts exactly one edge proxy in front of a service, so 1 is the right
 * default. Raise it only if you add another trusted layer (a CDN in front of
 * Railway, say) — each additional hop appends one more value.
 */
const TRUSTED_PROXY_HOPS = Math.max(
  1,
  parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10) || 1
);

/**
 * Resolve the client IP from proxy headers, ignoring anything the client could
 * have chosen for itself.
 *
 * ⚠️ `x-forwarded-for` is APPEND-ONLY and ordered left-to-right as
 * `client, proxy1, proxy2, ...`. A client can send whatever it likes, and the
 * first trusted proxy simply appends the address it actually saw. So the
 * LEFTMOST value is attacker-controlled and the RIGHTMOST values are the ones
 * written by infrastructure we control.
 *
 * Reading the leftmost value (as this did previously) let an attacker rotate
 * `x-forwarded-for` on every request to land in a fresh rate-limit bucket each
 * time — unlimited login attempts with the limiter still reporting healthy.
 *
 * Counting from the right by the number of trusted hops is what makes the value
 * unspoofable: a client-supplied entry gets pushed further left by every proxy
 * it passes through, so it can never occupy the position we read.
 */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');

  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    const candidate = parts[parts.length - TRUSTED_PROXY_HOPS];
    if (candidate) return candidate;

    // Fewer entries than configured hops means the request did not traverse the
    // proxy chain we expect. Deliberately fall through rather than reading a
    // left-hand value — a misconfiguration must not silently become a bypass.
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return 'unknown';
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Build a rate limit key from the request.
 * Uses client IP + optional discriminator (e.g. phone number).
 */
export function getRateLimitKey(request: Request, discriminator?: string): string {
  const ip = getClientIp(request);

  if (discriminator) {
    return `${ip}:${discriminator}`;
  }
  return ip;
}
