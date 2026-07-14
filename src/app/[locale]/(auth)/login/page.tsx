'use client';

/**
 * ISSA — Premium Login Page
 *
 * Designed with a stunning water-inspired brand aesthetic:
 *   - Dark ocean gradients and glowing animated blurred background circles.
 *   - Glassmorphism card container with subtle border highlights.
 *   - Fully localized with next-intl (English / Arabic).
 *   - Validations, loading indicators, and remembered sessions.
 */

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { locales } from '@/lib/i18n/config';

export default function LoginPage() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const params = useParams();
  const currentLocale = params.locale as string;
  const { login } = useAuth();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const user = await login(phoneNumber, password, rememberMe);
      // Determine redirection based on the role returned by login()
      // (super admins go to the admin panel, trainees go to their portal,
      // everyone else to the staff dashboard).
      const destination =
        user.role === 'SUPER_ADMIN'
          ? `/${currentLocale}/admin`
          : user.role === 'TRAINEE'
            ? `/${currentLocale}/portal`
            : `/${currentLocale}/dashboard`;

      router.replace(destination);
      // Ensure server components on the destination re-render with the new
      // auth state (router.replace alone does not refetch RSC payloads here).
      router.refresh();
    } catch (err: any) {
      setError(err.message || t('invalidCredentials'));
      setIsLoading(false);
    }
  };

  const handleLanguageToggle = () => {
    const nextLocale = currentLocale === 'en' ? 'ar' : 'en';
    // Persist local selection in cookies
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    
    // Replace locale prefix in URL and push
    const newPathname = window.location.pathname.replace(
      `/${currentLocale}`,
      `/${nextLocale}`
    );
    router.push(newPathname);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* ─── Animated Background Blobs ─── */}
      <div className="absolute top-[-20%] start-[-10%] h-[600px] w-[600px] rounded-full bg-cyan-700/20 blur-[120px] animate-pulse duration-[8000ms] pointer-events-none" />
      <div className="absolute bottom-[-10%] end-[-10%] h-[700px] w-[700px] rounded-full bg-blue-300/30 dark:bg-blue-800/20 blur-[130px] animate-pulse duration-[10000ms] pointer-events-none" />
      <div className="absolute top-[30%] start-[40%] h-[300px] w-[300px] rounded-full bg-emerald-700/10 blur-[90px] pointer-events-none" />

      {/* Floating Animated Bubbles */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute bottom-10 start-[15%] h-12 w-12 rounded-full border border-cyan-500/20 bg-cyan-500/5 blur-[2px] animate-bounce duration-[6000ms]" />
        <div className="absolute top-20 end-[20%] h-8 w-8 rounded-full border border-blue-400/20 bg-blue-400/5 blur-[1px] animate-bounce duration-[4500ms]" />
        <div className="absolute bottom-[40%] end-[10%] h-16 w-16 rounded-full border border-teal-500/10 bg-teal-500/5 blur-[3px] animate-pulse duration-[7000ms]" />
      </div>

      {/* ─── Header bar with Language Toggle ─── */}
      <div className="absolute top-6 start-0 end-0 px-6 flex justify-between items-center z-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-wide bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            {tCommon('appName')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={handleLanguageToggle}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100/70 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all duration-300 backdrop-blur-md text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            {currentLocale === 'en' ? 'العربية (AR)' : 'English (EN)'}
          </button>
        </div>
      </div>

      {/* ─── Login Card ─── */}
      <div className="w-full max-w-md p-1.5 rounded-3xl bg-gradient-to-b from-cyan-500/10 via-blue-500/5 to-slate-50 dark:to-slate-950 border border-slate-200/80 dark:border-slate-800/80 shadow-2xl backdrop-blur-xl z-10 mx-4 transition-all duration-500 hover:border-slate-300/80 dark:hover:border-slate-700/80">
        <div className="bg-white/90 dark:bg-slate-950/90 rounded-[22px] px-8 py-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
              {t('loginTitle')}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {t('loginSubtitle')}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/50 text-red-200 text-xs flex items-start gap-2.5 animate-shake">
              <svg className="h-4.5 w-4.5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Phone Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                {t('phoneNumber')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-500">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+201000000000"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 ps-11 pe-4 py-3 text-sm placeholder:text-slate-500 dark:placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-500/10 transition-all duration-300 text-slate-900 dark:text-slate-100"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  {t('password')}
                </label>
                <a
                  href="#"
                  className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
                >
                  {t('forgotPassword')}
                </a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-500">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 ps-11 pe-4 py-3 text-sm placeholder:text-slate-500 dark:placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-500/10 transition-all duration-300 text-slate-900 dark:text-slate-100"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center">
              <label className="relative flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only peer"
                  disabled={isLoading}
                />
                <div className="h-5 w-5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 peer-checked:bg-cyan-500 peer-checked:border-cyan-500 flex items-center justify-center transition-all duration-200">
                  <svg className="h-3 w-3 text-slate-950 font-bold scale-0 peer-checked:scale-100 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="ms-2.5 text-xs text-slate-600 dark:text-slate-400">
                  {t('rememberMe')}
                </span>
              </label>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3.5 px-4 text-sm transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-cyan-500/10 disabled:opacity-50 disabled:pointer-events-none group"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {tCommon('loading')}
                </span>
              ) : (
                t('login')
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
