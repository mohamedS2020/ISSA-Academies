import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // Opt into the App Router
  // Prisma requires server-side Node.js runtime for database access
  serverExternalPackages: ["@prisma/client", "bcryptjs"],

  // Allow the dev server to be accessed from LAN origins (e.g. testing from a
  // phone or another machine on the network). Without this, Next.js blocks
  // cross-origin requests to dev-only assets and HMR, which can leave the
  // client bundle in a broken state. Extend this list for your network.
  allowedDevOrigins: ["10.250.42.215"],
};

export default withNextIntl(nextConfig);
