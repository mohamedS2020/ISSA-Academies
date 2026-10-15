/**
 * Landing-page translations.
 *
 * The marketing site's copy lives in its own message files
 * (src/messages/landing/{en,ar}.json) so the app never ships it, and the app's
 * catalogue never reaches the landing page. Server-only: client components
 * receive the strings they need as props.
 */

import { createTranslator } from 'next-intl';
import en from '@/messages/landing/en.json';
import ar from '@/messages/landing/ar.json';
import type { Locale } from './config';

export type LandingMessages = typeof en;

// Both files must have the same shape; landing-messages.test.ts enforces it.
const MESSAGES: Record<Locale, LandingMessages> = { en, ar: ar as LandingMessages };

export function getLandingMessages(locale: Locale): LandingMessages {
  return MESSAGES[locale];
}

export function getLandingTranslator(locale: Locale) {
  return createTranslator({ locale, messages: MESSAGES[locale] });
}

export type LandingTranslator = ReturnType<typeof getLandingTranslator>;
