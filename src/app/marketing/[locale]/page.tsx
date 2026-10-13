/**
 * The Yallacademy landing page (English at `/`, Arabic at `/ar`).
 *
 * Built from design/yallacademy-website. All copy comes from
 * src/messages/landing/{en,ar}.json; every placeholder from
 * src/lib/config/marketing.ts. Rendered to static HTML at build time, so the
 * text is in the document, not injected by JavaScript.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isValidLocale, type Locale } from '@/lib/i18n/config';
import { getLandingTranslator } from '@/lib/i18n/landing';
import {
  MARKETING,
  MARKETING_DEFAULT_LOCALE,
  SITE_URL,
  landingPath,
  landingUrl,
} from '@/lib/config/marketing';
import { buildLandingJsonLd, serializeJsonLd } from '@/lib/marketing/json-ld';
import { SiteNav } from '@/components/marketing/site-nav';
import { HeroSection } from '@/components/marketing/hero-section';
import { PlatformSection } from '@/components/marketing/platform-section';
import { RolesSection } from '@/components/marketing/roles-section';
import { WhySection } from '@/components/marketing/why-section';
import { HowSection } from '@/components/marketing/how-section';
import { PricingSection } from '@/components/marketing/pricing-section';
import { FaqSection } from '@/components/marketing/faq-section';
import { CtaSection } from '@/components/marketing/cta-section';
import { SiteFooter, WhatsAppFloat } from '@/components/marketing/site-footer';
import { RevealObserver } from '@/components/marketing/reveal-observer';
import { LOGOS } from '@/components/marketing/logos';

const OPEN_GRAPH_LOCALE: Record<Locale, string> = { en: 'en_US', ar: 'ar_EG' };

export async function generateMetadata({ params }: PageProps<'/marketing/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const t = getLandingTranslator(locale);
  const title = t('meta.title');
  const description = t('meta.description');
  const url = landingUrl(locale);
  const image = `/assets/img/og-${locale}.png`;
  const otherLocale: Locale = locale === 'en' ? 'ar' : 'en';

  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
      languages: {
        en: landingUrl('en'),
        ar: landingUrl('ar'),
        'x-default': landingUrl(MARKETING_DEFAULT_LOCALE),
      },
    },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    openGraph: {
      type: 'website',
      siteName: t('meta.siteName'),
      title,
      description,
      url,
      images: [{ url: image, width: 1200, height: 630 }],
      locale: OPEN_GRAPH_LOCALE[locale],
      alternateLocale: [OPEN_GRAPH_LOCALE[otherLocale]],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: '/apple-touch-icon.png',
    },
    manifest: '/site.webmanifest',
  };
}

export default async function LandingPage({ params }: PageProps<'/marketing/[locale]'>) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const t = getLandingTranslator(locale);
  const otherLocale: Locale = locale === 'en' ? 'ar' : 'en';
  const logo = LOGOS[locale];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildLandingJsonLd(locale)) }}
      />
      <a className="skip-link" href="#main">
        {t('a11y.skipLink')}
      </a>

      <SiteNav
        homePath={landingPath(locale)}
        logo={{ src: logo.src, alt: logo.alt, width: logo.navWidth, height: 34 }}
        logoLabel={t('nav.logoLabel')}
        menuLabel={t('nav.menuLabel')}
        links={[
          { href: '#platform', label: t('nav.links.platform') },
          { href: '#roles', label: t('nav.links.roles') },
          { href: '#how', label: t('nav.links.how') },
          { href: '#pricing', label: t('nav.links.pricing') },
          { href: '#faq', label: t('nav.links.faq') },
        ]}
        otherLanguage={{ href: landingPath(otherLocale), locale: otherLocale, label: t('nav.otherLanguage') }}
        login={{ href: MARKETING.loginPath[locale], label: t('nav.login') }}
        bookDemo={t('nav.bookDemo')}
      />

      <main id="main">
        <HeroSection t={t} />
        <PlatformSection t={t} />
        <RolesSection t={t} />
        <WhySection t={t} />
        <HowSection t={t} />
        <PricingSection t={t} locale={locale} />
        <FaqSection t={t} />
        <CtaSection t={t} locale={locale} />
      </main>

      <SiteFooter t={t} locale={locale} otherLocale={otherLocale} otherLanguageLabel={t('nav.otherLanguage')} />
      <WhatsAppFloat label={t('a11y.whatsappFloat')} />
      <RevealObserver />
    </>
  );
}
