'use client';

/**
 * Registers public/sw.js (offline page, cached build files) once the page has
 * loaded, so it never competes with the first render. Production only: in
 * development a worker would keep serving stale files between edits.
 */
import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        // Not fatal: the app works the same without it, minus the offline page.
        console.warn('[pwa] service worker registration failed', err);
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
