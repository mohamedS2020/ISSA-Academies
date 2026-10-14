'use client';

/**
 * Starts the landing page's scroll animation once the page has hydrated.
 * The animation code (and Motion) loads in its own chunk, after everything
 * else, and not at all when reduced motion is requested. Switching reduced
 * motion on later stops it and leaves the page in its finished state.
 */

import { useEffect } from 'react';
import { REDUCED_MOTION } from './use-media-query';

export function LandingMotion() {
  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION);
    if (media.matches) return;

    let stop: (() => void) | undefined;
    let cancelled = false;
    // After the font has loaded, so text is measured in its final shape.
    Promise.all([import('./runtime'), document.fonts.ready])
      .then(([{ startLandingMotion }]) => {
        if (!cancelled && !media.matches) stop = startLandingMotion();
      })
      // The page is complete without it.
      .catch(() => {});

    const onChange = () => {
      if (!media.matches) return;
      stop?.();
      stop = undefined;
    };
    media.addEventListener('change', onChange);
    return () => {
      cancelled = true;
      media.removeEventListener('change', onChange);
      stop?.();
    };
  }, []);

  return null;
}
