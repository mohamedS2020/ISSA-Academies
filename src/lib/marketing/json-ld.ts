/**
 * Structured data (schema.org JSON-LD) for the landing pages: Organization,
 * WebSite, SoftwareApplication, WebPage and FAQPage, as in the design.
 *
 * GEO rule: the one-sentence definition and every FAQ answer here are the SAME
 * strings the page shows. They are read from the message files, never retyped,
 * so the page, the structured data and llms.txt cannot drift apart.
 */

import type { Locale } from '@/lib/i18n/config';
import { getLandingMessages } from '@/lib/i18n/landing';
import { MARKETING, SITE_URL, landingUrl } from '@/lib/config/marketing';

export function buildLandingJsonLd(locale: Locale) {
  const messages = getLandingMessages(locale);
  const english = getLandingMessages('en');
  // Page `@id`s are the page URL + a fragment:
  // "https://yallacademy.com/#page" and "https://yallacademy.com/ar#page".
  const pageUrl = landingUrl(locale);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#org`,
        name: 'Yallacademy',
        alternateName: ['يلّا أكاديمي', 'Yalla Academy'],
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/assets/img/symbol.svg`,
        // The design uses the English definition here on both pages.
        description: english.faq.items[0].a,
        areaServed: [
          { '@type': 'Country', name: 'Egypt' },
          { '@type': 'Place', name: 'Middle East and North Africa' },
        ],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'sales',
          availableLanguage: ['Arabic', 'English'],
          url: `https://wa.me/${MARKETING.whatsappNumber}`,
          email: MARKETING.email,
        },
        sameAs: [MARKETING.social.instagram, MARKETING.social.facebook, MARKETING.social.linkedin],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: 'Yallacademy',
        alternateName: 'يلّا أكاديمي',
        inLanguage: ['ar', 'en'],
        publisher: { '@id': `${SITE_URL}/#org` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#app`,
        name: 'Yallacademy',
        alternateName: 'يلّا أكاديمي',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Sports academy management software',
        operatingSystem: 'Web browser (desktop and mobile)',
        inLanguage: ['ar', 'en'],
        description: messages.faq.items[0].a,
        url: pageUrl,
        featureList: messages.jsonLd.featureList,
        audience: { '@type': 'BusinessAudience', audienceType: 'Sports academy owners and managers' },
        publisher: { '@id': `${SITE_URL}/#org` },
      },
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#page`,
        url: pageUrl,
        name: messages.meta.title,
        description: messages.meta.description,
        inLanguage: locale,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: { '@id': `${SITE_URL}/#app` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${pageUrl}#faq`,
        inLanguage: locale,
        mainEntity: messages.faq.items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };
}

/** Serialise for a <script type="application/ld+json">, safe against "</script>". */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
