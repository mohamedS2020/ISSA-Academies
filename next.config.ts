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
};

export default withNextIntl(nextConfig);
