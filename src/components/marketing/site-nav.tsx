'use client';

/**
 * Sticky landing-page navigation: the shadow once the page scrolls, the
 * mobile menu, and (with motion allowed) hiding while you scroll down and
 * coming back as soon as you scroll up. A thin progress line sits under it
 * and stays at the top while it is hidden; the motion code fills it with the
 * scroll. Everything else is plain links, server-rendered.
 */

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { IconMenu } from './icons';
import { REDUCED_MOTION, useMediaQuery } from './motion/use-media-query';

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

/** Scrolled less than this from the top, the nav always shows. */
const HIDE_AFTER = 160;
/** Ignore scroll moves smaller than this, so it doesn't flicker. */
const SCROLL_SLACK = 6;

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
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const reduceMotion = useMediaQuery(REDUCED_MOTION, true);
  const headerRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 8);
      if (reduceMotion || open || y <= HIDE_AFTER) {
        setHidden(false);
        lastY = y;
        return;
      }
      if (Math.abs(y - lastY) < SCROLL_SLACK) return;
      setHidden(y > lastY);
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [reduceMotion, open]);

  // The progress line sits just under the nav, so it needs the nav's height.
  useEffect(() => {
    const header = headerRef.current;
    const progress = progressRef.current;
    if (!header || !progress) return;
    const measure = () => progress.style.setProperty('--nav-h', `${header.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const className = ['nav', scrolled && 'is-scrolled', hidden && 'is-hidden', open && 'is-open']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <header ref={headerRef} className={className}>
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
      <div ref={progressRef} className="nav-progress" aria-hidden="true">
        <span />
      </div>
    </>
  );
}
