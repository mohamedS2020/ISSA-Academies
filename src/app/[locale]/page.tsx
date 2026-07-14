import { useTranslations } from "next-intl";
import { redirect } from "next/navigation";

/**
 * Root page for each locale — redirects to the login page.
 * In production, this will check authentication and redirect
 * to the appropriate dashboard.
 */
export default function LocaleRootPage() {
  // For now, redirect to login
  redirect("login");
}
