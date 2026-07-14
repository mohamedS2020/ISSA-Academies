/**
 * ISSA — next-intl Request Configuration
 *
 * This file configures next-intl to load the correct messages
 * for the current locale. It's imported by next-intl's provider.
 */

import { getRequestConfig } from 'next-intl/server';
import { isValidLocale, defaultLocale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  // Resolve the locale from the request (set by proxy.ts routing)
  let locale = await requestLocale;

  if (!locale || !isValidLocale(locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
