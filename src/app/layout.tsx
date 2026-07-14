import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ISSA Swimming Academy",
  description:
    "Swimming Academy Management System — manage trainees, subscriptions, scheduling, attendance, and finances.",
};

/**
 * Root layout — minimal wrapper. Locale-specific layout is in [locale]/layout.tsx.
 * This file exists because Next.js requires a root layout.tsx in src/app/.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
