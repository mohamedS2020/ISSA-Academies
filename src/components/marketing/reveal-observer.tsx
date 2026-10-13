'use client';

/**
 * Reveal-on-scroll, ported from the design's main.js: each `.reveal` element
 * fades up once when it enters the viewport. The hidden starting state is CSS
 * gated on `html.js`, so without JavaScript nothing is ever hidden.
 */

import { useEffect } from 'react';

export function RevealObserver() {
  useEffect(() => {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach((element) => element.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    items.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return null;
}
