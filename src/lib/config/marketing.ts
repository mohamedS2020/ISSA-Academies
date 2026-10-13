/**
 * Marketing site settings: every value you still have to fill in, in one place.
 *
 * Anything in [square brackets] is a placeholder carried over from the design.
 * Replace it here and it changes everywhere it appears: the page, the structured
 * data (JSON-LD), and llms.txt where noted. Brackets are kept until then so a
 * forgotten placeholder is easy to spot on the live page.
 */

import type { Locale } from '@/lib/i18n/config';

/** The canonical site address. No trailing slash. */
export const SITE_URL = 'https://yallacademy.com';

/** The language served at the site root. The other one lives under /<locale>. */
export const MARKETING_DEFAULT_LOCALE: Locale = 'en';

export const MARKETING = {
  /** WhatsApp number in wa.me format: country code + number, no "+" or spaces (e.g. 201XXXXXXXXX). Also in public/llms.txt. */
  whatsappNumber: '[YOUR-NUMBER]',

  /** Public contact email. Also in public/llms.txt. */
  email: '[hello@yallacademy.com]',

  /** Social profiles: the footer icons and the JSON-LD `sameAs` list. */
  social: {
    instagram: '[https://www.instagram.com/yallacademy]',
    facebook: '[https://www.facebook.com/yallacademy]',
    linkedin: '[https://www.linkedin.com/company/yallacademy]',
  },

  /** Monthly price per plan. Set the same number for both languages once decided. */
  prices: {
    starter: { en: '[PRICE]', ar: '[السعر]' },
    pro: { en: '[PRICE]', ar: '[السعر]' },
  },

  /**
   * Optional: also forward every demo request to this URL as JSON (a CRM, a
   * form service, a webhook). Leads are always saved and visible in the Super
   * Admin panel; while this stays a [placeholder], nothing is forwarded.
   */
  formEndpoint: '[YOUR-FORM-ENDPOINT]',

  /** Where "Log in" goes. The root-domain login handles Super Admin and every academy. */
  loginPath: { en: '/en/login', ar: '/ar/login' } satisfies Record<Locale, string>,

  /** Footer company links. "#" until the pages exist. */
  footerLinks: {
    about: '#',
    contact: '#',
    privacy: '#',
    terms: '#',
  },
} as const;

/** True while a value is still a [placeholder] from the design. */
export function isPlaceholder(value: string): boolean {
  return value.startsWith('[');
}

export const whatsappUrl = `https://wa.me/${MARKETING.whatsappNumber}`;

/** A link target for a configurable URL: "#" while it is still a placeholder. */
export function hrefOrHash(url: string): string {
  return isPlaceholder(url) ? '#' : url;
}

/** The public address of a landing page, as used for canonical and hreflang. */
export function landingUrl(locale: Locale): string {
  return locale === MARKETING_DEFAULT_LOCALE ? `${SITE_URL}/` : `${SITE_URL}/${locale}`;
}

/** The in-site path of a landing page (for links between the two languages). */
export function landingPath(locale: Locale): string {
  return locale === MARKETING_DEFAULT_LOCALE ? '/' : `/${locale}`;
}
