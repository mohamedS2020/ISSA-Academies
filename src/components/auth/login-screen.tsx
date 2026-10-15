'use client';

/**
 * The sign-in screen, rendered by src/app/[locale]/(auth)/login/page.tsx.
 *
 * Built like the marketing site's forms: a white card on Mist, 48px fields
 * and buttons, a Deep Sea primary button, Lagoon focus. On an academy's
 * subdomain the academy's name heads the card and its sport colours the
 * primary button (the layout sets data-sport); on the main domain it is
 * Yallacademy's own page, with the logo.
 *
 * Deliberately static. The previous design animated large blurred shapes
 * behind a frosted card, which kept the browser busy for as long as the page
 * was open: half a desktop CPU core while idle, far more than a phone can
 * spare (hardening plan §36).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  useAuth,
  AcademySelectionRequiredError,
  type AcademyChoice,
} from '@/lib/auth/auth-context';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { BrandLogo } from '@/components/layout/brand-logo';
import { appName } from '@/lib/config/brand';

interface LoginScreenProps {
  locale: string;
  /** The academy's name when reached on its subdomain; null on the main domain. */
  academyName: string | null;
}

const FOCUS_RING =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

const FIELD =
  'h-12 w-full rounded-md border border-input bg-card px-3.5 text-[15px] text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-3 focus:outline-lagoon-200 dark:focus:outline-lagoon-800 disabled:opacity-60';

export function LoginScreen({ locale, academyName }: LoginScreenProps) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const currentLocale = locale;
  const { login } = useAuth();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Set when the same phone and password exist at more than one academy; the
  // user picks one and we retry with it. Empty means no choice is pending.
  const [academyChoices, setAcademyChoices] = useState<AcademyChoice[]>([]);

  const handleSubmit = async (e: React.FormEvent, academySlug?: string) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const user = await login(phoneNumber, password, rememberMe, academySlug);
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
    } catch (err) {
      if (err instanceof AcademySelectionRequiredError) {
        // Not a failure — the credentials were correct, we just need to know
        // which academy. Show the picker instead of an error.
        setAcademyChoices(err.academies);
      } else {
        setError((err instanceof Error && err.message) || t('invalidCredentials'));
        setAcademyChoices([]);
      }
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        {academyName ? (
          <span />
        ) : (
          // The marketing site: `/` in English, `/ar` in Arabic.
          <a href={currentLocale === 'ar' ? '/ar' : '/'} className={`rounded-md ${FOCUS_RING}`}>
            <BrandLogo locale={currentLocale} className="h-10 w-auto" eager />
          </a>
        )}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLanguageToggle}
            lang={currentLocale === 'en' ? 'ar' : 'en'}
            className={`inline-flex min-h-10 items-center rounded-md px-2.5 text-sm transition-colors hover:text-primary ${FOCUS_RING}`}
          >
            {currentLocale === 'en' ? 'العربية' : 'English'}
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-4">
        <div className="w-full max-w-[26rem]">
          <div className="rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-xl shadow-midnight/5 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight">
              {academyName ?? t('loginTitle')}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t('loginSubtitle')}</p>

            {error && (
              <div role="alert" className="mt-6 rounded-md bg-danger-soft px-3.5 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {academyChoices.length > 0 && (
              <div className="mt-6 rounded-xl border border-border bg-muted p-4 text-sm">
                <p className="leading-relaxed">{t('chooseAcademy')}</p>
                <div className="mt-3 grid gap-2">
                  {academyChoices.map((academy) => (
                    <button
                      key={academy.slug}
                      type="button"
                      disabled={isLoading}
                      onClick={(e) => handleSubmit(e, academy.slug)}
                      className={`w-full rounded-md border border-border bg-card px-4 py-2.5 text-start font-medium transition-colors hover:border-primary disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      {academy.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="login-phone" className="text-sm font-medium">
                  {t('phoneNumber')}
                </label>
                {/* Phone numbers read left to right in both languages. */}
                <input
                  id="login-phone"
                  type="tel"
                  dir="ltr"
                  autoComplete="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+201000000000"
                  className={`${FIELD} text-left rtl:text-right`}
                  disabled={isLoading}
                />
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="login-password" className="text-sm font-medium">
                    {t('password')}
                  </label>
                  <a
                    href="#"
                    className={`rounded-sm text-sm font-medium text-primary hover:underline ${FOCUS_RING}`}
                  >
                    {t('forgotPassword')}
                  </a>
                </div>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className={FIELD}
                  disabled={isLoading}
                />
              </div>

              <label className="flex w-fit cursor-pointer select-none items-center gap-2.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className={`size-4 cursor-pointer accent-primary ${FOCUS_RING}`}
                  disabled={isLoading}
                />
                {t('rememberMe')}
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className={`mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60 ${FOCUS_RING}`}
              >
                {isLoading ? (
                  <>
                    <svg className="size-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {tCommon('loading')}
                  </>
                ) : (
                  t('login')
                )}
              </button>
            </form>
          </div>

          {academyName && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              {t('poweredBy', { name: appName(currentLocale) })}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
