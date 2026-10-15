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
 *   - A simple top nav bar: Dashboard, Schedule, Attendance, Subscription,
 *     Receipts + language toggle + logout
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

  const navItems = [
    { label: t('title'), href: `/${locale}/portal`, icon: LayoutDashboard },
    { label: t('schedule'), href: `/${locale}/portal/schedule`, icon: Calendar },
    { label: t('attendance'), href: `/${locale}/portal/attendance`, icon: UserCheck },
    { label: t('subscription'), href: `/${locale}/portal/subscription`, icon: CreditCard },
    { label: t('receipts'), href: `/${locale}/portal/receipts`, icon: Receipt },
  ];

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
      className="min-h-screen bg-background text-foreground font-sans relative"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="absolute top-[-10%] start-[-10%] h-[400px] w-[400px] rounded-full bg-primary/6 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] end-[-10%] h-[400px] w-[400px] rounded-full bg-primary/6 blur-[120px] pointer-events-none" />

      {/* ─── Top Nav Bar ─── */}
      <header className="sticky top-0 z-20 w-full bg-card/80 border-b border-border/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <BrandSymbol className="h-8 w-auto" />
            <span className="hidden sm:inline text-xs font-extrabold tracking-wider text-foreground/80">
              {t('title')}
            </span>
          </div>

          <nav className="flex-1 flex items-center justify-center gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary dark:text-primary border border-primary/30'
                      : 'text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  <Icon size={14} />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            <TraineeSwitcher />
            <ThemeToggle />
            <button
              onClick={handleLanguageToggle}
              className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-xl bg-muted/70 hover:bg-muted border border-border transition-colors text-foreground/80 hover:text-foreground"
            >
              <Globe size={14} className="text-primary dark:text-primary" />
              <span>{locale === 'en' ? 'AR' : 'EN'}</span>
            </button>
            <button
              onClick={() => {
                setPasswordError(null);
                setPasswordSuccess(null);
                setIsChangePasswordOpen(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-xl bg-muted/70 hover:bg-muted border border-border transition-colors text-foreground/80 hover:text-primary dark:hover:text-primary"
              title={tAuth('changePassword')}
            >
              <KeyRound size={14} />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-xl bg-muted/70 hover:bg-danger-soft border border-border hover:border-danger/50 transition-colors text-foreground/80 hover:text-danger"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ─── Page Content ─── */}
      <main className="max-w-5xl mx-auto p-4 md:p-6 relative z-10">{children}</main>
    </div>

    {/* ─── Change Password Modal ─── */}
    {isChangePasswordOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 backdrop-blur-md px-4">
        <div className="w-full max-w-md p-1 rounded-3xl bg-gradient-to-b from-primary/10 via-primary/5 to-background border border-border/80 shadow-2xl backdrop-blur-xl">
          <div className="bg-card/95 rounded-[22px] p-6">
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
                className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                &times;
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
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tAuth('currentPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                  disabled={isSubmittingPassword || !!passwordSuccess}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tAuth('newPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                  disabled={isSubmittingPassword || !!passwordSuccess}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tAuth('confirmPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
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
