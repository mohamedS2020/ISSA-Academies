'use client';

/**
 * Sticky landing-page navigation: the shadow once the page scrolls, and the
 * mobile menu. Everything else is plain links, server-rendered.
 */

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { IconMenu } from './icons';

export interface SiteNavProps {
  homePath: string;
  logo: { src: string; alt: string; width: number; height: number };
  logoLabel: string;
  menuLabel: string;
  links: { href: string; label: string }[];
  otherLanguage: { href: string; locale: string; label: string };
  login: { href: string; label: string };
  bookDemo: string;
}

export function SiteNav({
  homePath,
  logo,
  logoLabel,
  menuLabel,
  links,
  otherLanguage,
  login,
  bookDemo,
}: SiteNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const className = ['nav', scrolled && 'is-scrolled', open && 'is-open'].filter(Boolean).join(' ');

  return (
    <header className={className}>
      <div className="container nav-inner">
        <a className="nav-logo" href={homePath} aria-label={logoLabel}>
          <Image src={logo.src} alt={logo.alt} width={logo.width} height={logo.height} priority unoptimized />
        </a>
        <nav id="site-nav" className="nav-links" aria-label={menuLabel}>
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <a className="lang-switch" href={otherLanguage.href} hrefLang={otherLanguage.locale} lang={otherLanguage.locale}>
            {otherLanguage.label}
          </a>
          <a className="btn btn-ghost btn-sm hide-sm" href={login.href}>
            {login.label}
          </a>
          <a className="btn btn-primary btn-sm" href="#demo">
            {bookDemo}
          </a>
          <button
            className="nav-toggle"
            type="button"
            aria-expanded={open}
            aria-controls="site-nav"
            aria-label={menuLabel}
            onClick={() => setOpen((value) => !value)}
          >
            <IconMenu />
          </button>
        </div>
      </div>
    </header>
  );
}
