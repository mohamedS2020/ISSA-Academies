import type { MetadataRoute } from 'next';
import { MARKETING_DEFAULT_LOCALE, landingUrl } from '@/lib/config/marketing';

/**
 * /sitemap.xml: the two landing pages, each listing both languages and the
 * default (x-default), matching the hreflang links in the pages themselves.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = {
    en: landingUrl('en'),
    ar: landingUrl('ar'),
    'x-default': landingUrl(MARKETING_DEFAULT_LOCALE),
  };
  return [
    { url: landingUrl('en'), changeFrequency: 'weekly', priority: 1.0, alternates: { languages } },
    { url: landingUrl('ar'), changeFrequency: 'weekly', priority: 0.9, alternates: { languages } },
  ];
}
