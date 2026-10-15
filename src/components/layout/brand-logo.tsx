import Image from 'next/image';
import { appName } from '@/lib/config/brand';

/**
 * The Yallacademy logo, from the brand package's own files (public/assets/img).
 * Always used as a file, never redrawn or retyped: the wordmark is outlined
 * artwork, and the brand rules forbid recolouring or rebuilding the mark.
 *
 * Each file comes in two colourways: "color" (Midnight Y and crossbar) for
 * light backgrounds and "reversed" (white Y and crossbar) for dark ones. Both
 * are rendered and `.dark` decides which shows; the hidden one is lazy, so
 * it only downloads if the theme switches.
 *
 * Size it with a height class (h-8 …) and w-auto.
 */

type Artwork = { light: string; dark: string; width: number; height: number };

// The brand's "small" symbol: a simplified cut (no blade) for anything under
// 40px tall, where the full mark's blade gets too thin.
const SMALL_SYMBOL: Artwork = {
  light: '/assets/img/symbol-small.svg',
  dark: '/assets/img/symbol-small-white.svg',
  width: 962,
  height: 1120,
};

// Symbol + wordmark side by side. The full mark needs 40px or more.
const LOGOS: Record<'en' | 'ar', Artwork> = {
  en: { light: '/assets/img/logo-en.svg', dark: '/assets/img/logo-en-white.svg', width: 2078, height: 520 },
  ar: { light: '/assets/img/logo-ar.svg', dark: '/assets/img/logo-ar-white.svg', width: 1477, height: 480 },
};

/** The YA symbol on its own, for small spots (sidebar, headers, loaders). */
export function BrandSymbol({ className = '', alt = '' }: { className?: string; alt?: string }) {
  return <Colourways artwork={SMALL_SYMBOL} className={className} alt={alt} />;
}

/** The horizontal logo with the wordmark in the page's language. */
export function BrandLogo({ locale, className = '' }: { locale: string; className?: string }) {
  return <Colourways artwork={locale === 'ar' ? LOGOS.ar : LOGOS.en} className={className} alt={appName(locale)} />;
}

function Colourways({ artwork, className, alt }: { artwork: Artwork; className: string; alt: string }) {
  const { light, dark, width, height } = artwork;
  return (
    <>
      <Image src={light} alt={alt} width={width} height={height} unoptimized className={`${className} dark:hidden`} />
      <Image src={dark} alt={alt} width={width} height={height} unoptimized className={`${className} hidden dark:block`} />
    </>
  );
}
