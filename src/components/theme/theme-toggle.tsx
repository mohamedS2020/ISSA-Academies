'use client';

/**
 * ISSA — Light/Dark theme toggle.
 *
 * A pill switch with a sliding thumb that crossfades a sun (light) and moon
 * (dark). Uses `useTheme().toggle()`. A `mounted` guard prevents an SSR/client
 * mismatch (the server can't know the resolved theme). Styled correctly in
 * both themes itself (JS-conditional classes, not the global codemod).
 */

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/theme/theme-context';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Before mount, assume dark (the app's historical default) to avoid a flash;
  // the real value snaps in on mount.
  const isDark = !mounted || resolvedTheme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      onClick={toggle}
      className={`group relative inline-flex h-8 w-[58px] shrink-0 items-center rounded-full border p-0.5 transition-colors duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 ${
        isDark
          ? 'border-slate-700 bg-gradient-to-r from-slate-800 to-indigo-950'
          : 'border-sky-300/70 bg-gradient-to-r from-sky-300 to-amber-200'
      } ${className}`}
    >
      {/* faint ambient icons on the track */}
      <Sun
        size={13}
        className={`pointer-events-none absolute left-2 text-amber-500 transition-opacity duration-500 ${
          isDark ? 'opacity-0' : 'opacity-70'
        }`}
      />
      <Moon
        size={11}
        className={`pointer-events-none absolute right-2 text-slate-400 transition-opacity duration-500 ${
          isDark ? 'opacity-60' : 'opacity-0'
        }`}
      />

      {/* sliding thumb */}
      <span
        className={`relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full shadow-md ring-1 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isDark
            ? 'translate-x-[26px] bg-slate-900 ring-slate-700'
            : 'translate-x-0 bg-white ring-sky-200'
        }`}
      >
        <Sun
          size={13}
          className={`absolute text-amber-500 transition-all duration-300 ${
            isDark ? 'scale-0 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'
          }`}
        />
        <Moon
          size={12}
          className={`absolute text-cyan-300 transition-all duration-300 ${
            isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-0 -rotate-90 opacity-0'
          }`}
        />
      </span>
    </button>
  );
}
