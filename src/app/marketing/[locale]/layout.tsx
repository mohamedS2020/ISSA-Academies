/**
 * Marketing site shell.
 *
 * A separate document from the app (its own <html>): none of the app's
 * providers, fonts or global styles load here, and both languages are
 * prerendered as static pages. proxy.ts serves it on the platform host:
 * `/` → /marketing/en and `/ar` → /marketing/ar. Never linked directly.
 */

import type { Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Readex_Pro } from 'next/font/google';
import { isRtlLocale, isValidLocale, locales } from '@/lib/i18n/config';
import { BRAND_COLORS } from '@/lib/config/brand-colors';
import '@/styles/marketing.css';

// The brand typeface: one variable font covering Arabic and Latin, self-hosted
// by next/font (no request to Google at runtime).
const readexPro = Readex_Pro({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-readex',
});

export const viewport: Viewport = {
  themeColor: BRAND_COLORS.midnight,
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

// Swap `no-js` for `js` before first paint. Reveal animations hide content only
// under `html.js`, so with JavaScript off nothing is ever hidden.
const JS_CLASS_SCRIPT = "document.documentElement.classList.replace('no-js','js')";

export default async function MarketingLayout({ children, params }: LayoutProps<'/marketing/[locale]'>) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  return (
    <html
      lang={locale}
      dir={isRtlLocale(locale) ? 'rtl' : 'ltr'}
      className={`no-js ${readexPro.variable}`}
      suppressHydrationWarning
    >
      <body className="site">
        <script dangerouslySetInnerHTML={{ __html: JS_CLASS_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
