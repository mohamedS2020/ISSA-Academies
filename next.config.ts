import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
// From /config, not the package root — the root re-export is deprecated and
// stops working in v11.
import { withSentryConfig } from "@sentry/nextjs/config";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // Opt into the App Router
  // Prisma requires server-side Node.js runtime for database access.
  // @react-pdf/renderer + exceljs are heavy and used ONLY in API route
  // handlers (src/services/export.service.tsx) — marking them external keeps
  // them out of any client/edge bundle for good.
  serverExternalPackages: [
    "@prisma/client",
    "bcryptjs",
    "@react-pdf/renderer",
    "exceljs",
  ],

  // Tree-shake barrel imports so pages only ship the icons/helpers they use.
  // lucide-react is the big one (a huge icon barrel); recharts + date-fns also
  // benefit. Shrinks per-route client JS with no behavioral change.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },

  // Allow the dev server to be accessed from LAN origins (e.g. testing from a
  // phone or another machine on the network). Without this, Next.js blocks
  // cross-origin requests to dev-only assets and HMR, which can leave the
  // client bundle in a broken state. Extend this list for your network.
  allowedDevOrigins: ["10.250.42.215"],

  // Security headers applied to every response.
  async headers() {
    const isProd = process.env.NODE_ENV === "production";

    // CSP shipped as Report-Only first: it never blocks, so it can't break the
    // app — it only surfaces violations so the policy can be tightened (e.g. a
    // nonce-based script-src) before enforcing. Tokens are already in httpOnly
    // cookies, so CSP here is defense-in-depth, not the primary XSS mitigation.
    const csp = [
      "default-src 'self'",
      // Next.js injects inline hydration/streaming scripts + the theme-init
      // script; 'unsafe-inline' keeps them working. Harden to a nonce/hash
      // before switching from Report-Only to enforcing.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      // 'self' is sufficient for Sentry because its browser SDK is tunnelled
      // through /monitoring on this origin rather than posting to
      // ingest.sentry.io directly — which also stops ad blockers swallowing
      // client-side error reports. Keep it that way when this CSP is enforced.
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
    ].join("; ");

    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      { key: "Content-Security-Policy-Report-Only", value: csp },
    ];

    // HSTS only over HTTPS (prod) — harmless on the Railway/custom domain, and
    // omitted in dev so http://localhost keeps working.
    if (isProd) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// ─── Sentry ──────────────────────────────────────────────────
// Source maps are uploaded only when SENTRY_AUTH_TOKEN, SENTRY_ORG and
// SENTRY_PROJECT are all present. Without them the build still succeeds and
// errors are still reported — the stack traces just point at minified bundle
// code, which is close to unreadable. Supply all three in Railway and CI to get
// real file names and line numbers.
//
// SENTRY_AUTH_TOKEN is a genuine secret (unlike the DSN, which is a write-only
// ingestion key and ships in the client bundle by design). Never commit it.
const sentryUploadConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT
);

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Don't let a missing token turn into build noise on every local build.
  silent: !process.env.CI,
  sourcemaps: { disable: !sentryUploadConfigured },

  // Strip the uploaded source maps from the deployed bundle so the original
  // source is not downloadable by anyone who opens devtools.
  widenClientFileUpload: true,

  // Routes Sentry's browser requests through the app's own domain, so ad
  // blockers (which block ingest.sentry.io outright) do not silently swallow
  // client-side error reports.
  tunnelRoute: "/monitoring",
});
