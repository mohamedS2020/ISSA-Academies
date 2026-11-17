'use client';

/**
 * Trainee Portal Layout
 *
 * Simplified, read-only portal shell — distinct from the staff (dashboard)
 * layout (no collapsible sidebar, no branch switcher, no staff-only links).
 *
 *   - Authentication protection and redirection to login
 *   - Defense-in-depth: non-TRAINEE roles are redirected to /dashboard
 *     (mirrors the symmetric guard in (dashboard)/layout.tsx)
 *   - Navigation: Dashboard, Schedule, Attendance, Subscription, Receipts.
 *     In the header from tablet width up; on phones a bottom tab bar, the
 *     pattern parents know from their other apps. (On phones the links used
 *     to share one header row with every control: they got 0 px and the page
 *     grew wider than the screen, hiding logout.)
 *   - Header controls: trainee picker (its own row on phones), theme,
 *     language, change password, logout
 *   - Full RTL support via logical CSS properties
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import { isRtlLocale } from '@/lib/i18n/config';
import {
  LayoutDashboard,
  Calendar,
  UserCheck,
  CreditCard,
  Receipt,
  Globe,
  LogOut,
  KeyRound,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { PortalTraineeProvider, TraineeSwitcher } from './portal-trainee-context';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { BrandSymbol } from '@/components/layout/brand-logo';

interface PortalLayoutProps {
  children: React.ReactNode;
}

export default function PortalLayout({ children }: PortalLayoutProps) {
  const t = useTranslations('portal');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const { isAuthenticated, isLoading, user, logout, authFetch } = useAuth();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const locale = params.locale as string;
  const isRtl = isRtlLocale(locale);

  // Change-password modal state
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/${locale}/login`);
    }
  }, [isLoading, isAuthenticated, locale, router]);

  // Defense-in-depth: only TRAINEE belongs here — staff who navigate to
  // /portal directly get bounced back to their own dashboard.
  useEffect(() => {
    if (!isLoading && isAuthenticated && user && user.role !== UserRole.TRAINEE) {
      router.replace(`/${locale}/dashboard`);
    }
  }, [isLoading, isAuthenticated, user, locale, router]);

  if (isLoading || !isAuthenticated || !user || user.role !== UserRole.TRAINEE) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  // `tab` is the short label for the phone tab bar (five tabs share 320 px).
  const navItems = [
    { label: t('title'), tab: t('tabHome'), href: `/${locale}/portal`, icon: LayoutDashboard },
    { label: t('schedule'), tab: t('tabSchedule'), href: `/${locale}/portal/schedule`, icon: Calendar },
    { label: t('attendance'), tab: t('tabAttendance'), href: `/${locale}/portal/attendance`, icon: UserCheck },
    { label: t('subscription'), tab: t('tabSubscription'), href: `/${locale}/portal/subscription`, icon: CreditCard },
    { label: t('receipts'), tab: t('tabReceipts'), href: `/${locale}/portal/receipts`, icon: Receipt },
  ];
  const iconButton =
    'flex-shrink-0 flex items-center justify-center h-10 w-10 sm:h-auto sm:w-auto sm:px-2.5 sm:py-2 rounded-xl bg-muted/70 hover:bg-muted border border-border transition-colors text-foreground/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  const handleLanguageToggle = () => {
    const nextLocale = locale === 'en' ? 'ar' : 'en';
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    router.push(pathname.replace(`/${locale}`, `/${nextLocale}`));
  };

  const handleLogout = () => {
    logout();
    router.push(`/${locale}/login`);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError(tAuth('passwordMismatch'));
      return;
    }

    setIsSubmittingPassword(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || tAuth('error'));
      }
      setPasswordSuccess(tAuth('passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setIsChangePasswordOpen(false);
        setPasswordSuccess(null);
      }, 2000);
    } catch (err: any) {
      setPasswordError(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  return (
    <PortalTraineeProvider>
    <div
      className="min-h-screen bg-background text-foreground font-sans relative overflow-x-clip"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Decorative glow; clipped above so it can't widen the page. */}
      <div className="absolute top-[-10%] start-[-10%] h-[400px] w-[400px] rounded-full bg-primary/6 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] end-[-10%] h-[400px] w-[400px] rounded-full bg-primary/6 blur-[120px] pointer-events-none" />

      {/* ─── Top Bar ─── */}
      <header className="sticky top-0 z-20 w-full bg-card/80 border-b border-border/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-4">
          <Link href={`/${locale}/portal`} aria-label={t('title')} className="flex items-center gap-2.5 flex-shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandSymbol className="h-8 w-auto" />
            <span className="hidden sm:inline text-xs font-extrabold tracking-wider text-foreground/80">
              {t('title')}
            </span>
          </Link>

          {/* Tablet and desktop: links in the header. */}
          <nav aria-label={t('title')} className="hidden md:flex flex-1 items-center justify-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="hidden sm:block min-w-0">
              <TraineeSwitcher />
            </div>
            <ThemeToggle />
            <button onClick={handleLanguageToggle} className={`${iconButton} gap-1.5 text-xs font-semibold hover:text-foreground`}>
              <Globe size={14} className="hidden sm:block text-primary" aria-hidden="true" />
              <span>{locale === 'en' ? 'AR' : 'EN'}</span>
            </button>
            <button
              onClick={() => {
                setPasswordError(null);
                setPasswordSuccess(null);
                setIsChangePasswordOpen(true);
              }}
              aria-label={tAuth('changePassword')}
              title={tAuth('changePassword')}
              className={`${iconButton} hover:text-primary`}
            >
              <KeyRound size={16} aria-hidden="true" />
            </button>
            <button
              onClick={handleLogout}
              aria-label={tAuth('logout')}
              title={tAuth('logout')}
              className={`${iconButton} hover:bg-danger-soft hover:border-danger/50 hover:text-danger`}
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Phones: the trainee picker (parents with more than one child) gets
            its own row. Renders nothing for a single trainee. */}
        <div className="sm:hidden px-3 pb-2.5 empty:hidden">
          <TraineeSwitcher />
        </div>
      </header>

      {/* ─── Page Content ─── (room at the bottom for the phone tab bar) */}
      <main className="max-w-5xl mx-auto p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-6 relative z-10">{children}</main>

      {/* ─── Phone tab bar ─── */}
      <nav
        aria-label={t('title')}
        data-testid="portal-tabbar"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 border-t border-border backdrop-blur-lg pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1 h-16 px-0.5 text-[10px] min-[360px]:text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className={`flex items-center justify-center h-7 w-12 rounded-full ${isActive ? 'bg-primary/10' : ''}`}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="max-w-full truncate">{item.tab}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>

    {/* ─── Change Password Modal ─── */}
    {isChangePasswordOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 backdrop-blur-md px-4">
        <div role="dialog" aria-modal="true" aria-label={tAuth('changePassword')} className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto p-1 rounded-3xl bg-gradient-to-b from-primary/10 via-primary/5 to-background border border-border/80 shadow-2xl backdrop-blur-xl">
          <div className="bg-card/95 rounded-[22px] p-5 sm:p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-foreground tracking-wide">
                {tAuth('changePassword')}
              </h2>
              <button
                onClick={() => {
                  setIsChangePasswordOpen(false);
                  setPasswordError(null);
                  setPasswordSuccess(null);
                }}
                aria-label={tCommon('close')}
                className="h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>

            {passwordError && (
              <div className="mb-4 p-3 rounded-xl bg-danger-soft border border-danger/40 text-danger text-xs flex items-start gap-2.5">
                <AlertTriangle size={14} className="text-danger flex-shrink-0 mt-0.5" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-success-soft border border-success/40 text-success text-xs flex items-start gap-2.5">
                <CheckCircle size={14} className="text-success flex-shrink-0 mt-0.5" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="portal-layout-f1" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tAuth('currentPassword')}
                </label>
                <input id="portal-layout-f1"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-base sm:text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                  disabled={isSubmittingPassword || !!passwordSuccess}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="portal-layout-f2" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tAuth('newPassword')}
                </label>
                <input id="portal-layout-f2"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-base sm:text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                  disabled={isSubmittingPassword || !!passwordSuccess}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="portal-layout-f3" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tAuth('confirmPassword')}
                </label>
                <input id="portal-layout-f3"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-base sm:text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                  disabled={isSubmittingPassword || !!passwordSuccess}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsChangePasswordOpen(false);
                    setPasswordError(null);
                    setPasswordSuccess(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all duration-200"
                  disabled={isSubmittingPassword || !!passwordSuccess}
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  disabled={isSubmittingPassword || !!passwordSuccess}
                >
                  {isSubmittingPassword && <Loader2 size={12} className="animate-spin" />}
                  <span>{tCommon('save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )}
    </PortalTraineeProvider>
  );
}
