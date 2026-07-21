import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

export default withNextIntl(nextConfig);
