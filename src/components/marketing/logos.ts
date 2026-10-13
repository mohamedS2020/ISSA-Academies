import type { Locale } from '@/lib/i18n/config';

/**
 * The brand logo files per language (public/assets/img). Used as files, never
 * redrawn: the wordmark is outlined vector art from the brand package.
 */
export const LOGOS: Record<Locale, { src: string; alt: string; navWidth: number; footerWidth: number }> = {
  en: { src: '/assets/img/logo-en.svg', alt: 'Yallacademy', navWidth: 136, footerWidth: 128 },
  ar: { src: '/assets/img/logo-ar.svg', alt: 'يلّا أكاديمي', navWidth: 105, footerWidth: 98 },
};
