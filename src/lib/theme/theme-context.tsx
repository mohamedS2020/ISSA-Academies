'use client';

/**
 * ISSA — Theme (light/dark) context.
 *
 * - `theme`: the user's choice — 'light' | 'dark' | 'system'.
 * - `resolvedTheme`: what's actually applied — 'light' | 'dark'.
 * - Default is 'system' (follows the OS); the first manual toggle persists an
 *   explicit choice to localStorage ('issa_theme') which then always wins.
 * - Applies/removes the `.dark` class on <html> (which drives every `dark:`
 *   utility via the @custom-variant in globals.css). The pre-hydration inline
 *   script in [locale]/layout.tsx sets the class before first paint (no FOUC);
 *   this provider just keeps React state in sync and reacts to OS changes.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'issa_theme';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function resolve(theme: Theme): Resolved {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

function applyClass(resolved: Resolved): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<Resolved>('dark');

  // Sync from storage on mount (the inline script already applied the class).
  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null)
        : null;
    const initial: Theme =
      stored === 'light' || stored === 'dark' || stored === 'system'
        ? stored
        : 'system';
    setThemeState(initial);
    setResolvedTheme(resolve(initial));
  }, []);

  // While following the system, react to OS light/dark changes live.
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const r: Resolved = mq.matches ? 'dark' : 'light';
      setResolvedTheme(r);
      applyClass(r);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    const r = resolve(t);
    setResolvedTheme(r);
    applyClass(r);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
