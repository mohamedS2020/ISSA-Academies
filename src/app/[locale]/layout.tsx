import { notFound } from "next/navigation";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { Geist, Geist_Mono } from "next/font/google";
import { isValidLocale, isRtlLocale } from "@/lib/i18n/config";
import { ToastProvider } from "@/components/feedback/toast-provider";
import { ErrorBoundary } from "@/components/feedback/error-boundary";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/lib/theme/theme-context";

// Runs before first paint to apply the persisted (or system) theme, so there is
// no flash of the wrong theme on load. Kept inline + minified on purpose.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('issa_theme');var d=t==='dark'||((t==='system'||!t)&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

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

  return (
    <html
      lang={locale}
      dir={direction}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <ThemeProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AuthProvider>
              <ToastProvider>
                <ErrorBoundary>{children}</ErrorBoundary>
              </ToastProvider>
            </AuthProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
