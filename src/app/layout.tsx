import type { Metadata } from "next";
import { APP_NAME } from "@/lib/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  // Sport-neutral: the platform serves swimming, football and other academies.
  description:
    "Academy management — trainees, subscriptions, scheduling, attendance, and finances.",
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
