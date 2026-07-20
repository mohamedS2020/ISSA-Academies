import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { Geist, Geist_Mono } from "next/font/google";
import { isValidLocale, isRtlLocale } from "@/lib/i18n/config";
import { ToastProvider } from "@/components/feedback/toast-provider";
import { ErrorBoundary } from "@/components/feedback/error-boundary";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/lib/theme/theme-context";
import { QueryProvider } from "@/lib/query/query-provider";
import { getAcademyHostContext } from "@/lib/tenant/host-context";
import { SPORTS } from "@/lib/theme/sports";

// Runs before first paint to apply, with no flash of the wrong look:
//   1. the persisted (or system) light/dark theme  → `.dark` class
//   2. the active sport theme                       → `data-sport` attribute
// Sport priority: logged-in user's academy (from stored issa_user) > the
// subdomain's academy (server-rendered `data-host-sport`) > "swimming" (base).
// The themeKey value is sanitized to lowercase letters; anything unknown falls
// back to the base palette. Kept inline + minified on purpose.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('issa_theme');var d=t==='dark'||((t==='system'||!t)&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}try{var el=document.documentElement;var host=el.getAttribute('data-host-sport');var u=localStorage.getItem('issa_user')||sessionStorage.getItem('issa_user');var s=u?JSON.parse(u).themeKey:null;var active=(s&&/^[a-z]+$/.test(s))?s:(host||'swimming');el.setAttribute('data-sport',active);}catch(e){}})();`;

/**
 * Per-academy metadata when reached via a subdomain (title + favicon reflect
 * the academy's sport). Falls back to the root layout's default metadata on the
 * bare domain.
 */
export async function generateMetadata(): Promise<Metadata> {
  const academy = await getAcademyHostContext();
  if (!academy) return {};
  return {
    title: `ISSA — ${academy.name}`,
    icons: { icon: SPORTS[academy.sport].favicon },
  };
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Locale layout — sets lang, dir, fonts, and provides i18n context.
 *
 * Next.js 16: params is a Promise, LayoutProps is globally available.
 */
export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  // The [locale] URL segment is the source of truth (proxy.ts guarantees a
  // valid prefix). Load its messages directly — this bypasses next-intl's
  // requestLocale, which the custom proxy never populates (the reason Arabic
  // text previously stayed English). No server-side getMessages() call means
  // no locale mismatch, so routing and the APIs are entirely unaffected.
  const messages = (await import(`@/messages/${locale}.json`)).default;
  const direction = isRtlLocale(locale) ? "rtl" : "ltr";

  // When reached via an academy subdomain, theme the page (incl. the public
  // login page) from the academy's sport server-side — no flash. `hostSport` is
  // undefined on the bare domain, so React omits the attributes and the client
  // script falls back to the logged-in user's sport (or swimming).
  const academy = await getAcademyHostContext();
  const hostSport = academy?.sport;

  return (
    <html
      lang={locale}
      dir={direction}
      data-sport={hostSport}
      data-host-sport={hostSport}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        {/* Pre-hydration theme/sport init. Plain inline script (not next/script)
            so it's in the SSR HTML and runs before first paint with no flash,
            and so React doesn't warn about a <script> child. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AuthProvider>
              <QueryProvider>
                <ToastProvider>
                  <ErrorBoundary>{children}</ErrorBoundary>
                </ToastProvider>
              </QueryProvider>
            </AuthProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
