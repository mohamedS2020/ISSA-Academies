import type { Metadata } from "next";
import { APP_NAME } from "@/lib/config/brand";

export const metadata: Metadata = {
  title: APP_NAME,
  // Sport-neutral: the platform serves swimming, football and other academies.
  description:
    "Academy management — trainees, subscriptions, scheduling, attendance, and finances.",
};

/**
 * Root layout — minimal wrapper. Next.js requires one in src/app/.
 *
 * Each section renders its own <html>: the app in [locale]/layout.tsx, the
 * marketing site in marketing/[locale]/layout.tsx. Global styles are imported
 * by those layouts, not here, so the app's stylesheet never loads on the
 * marketing site and vice versa.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
