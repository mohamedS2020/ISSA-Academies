'use client';

/**
 * Super Admin Layout
 *
 * Minimal layout for platform-level administration.
 * No sidebar (super admins don't have tenant/branch context).
 * Just a branded header with logout.
 */

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-context';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { BrandLogo } from '@/components/layout/brand-logo';
import { fetchLeads, leadKeys } from '@/components/superadmin/leads-api';

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('superAdmin');
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useParams<{ locale: string }>();
  const { logout } = useAuth();

  // How many leads are still NEW, for the badge. Refreshed whenever a lead
  // changes (the Leads page invalidates every leads query).
  const newLeads = useQuery({
    queryKey: [...leadKeys.all, 'new-count'],
    queryFn: () => fetchLeads({ status: 'NEW', page: 1, pageSize: 1 }),
    staleTime: 60_000,
  });
  const newCount = newLeads.data?.counts.NEW ?? 0;

  const base = `/${locale}/admin`;
  const section = pathname.startsWith(`${base}/leads`)
    ? 'leads'
    : pathname.startsWith(`${base}/settings`)
      ? 'settings'
      : 'academies';
  const navItems = [
    { key: 'academies', href: base, label: t('nav.academies'), badge: 0 },
    { key: 'leads', href: `${base}/leads`, label: t('nav.leads'), badge: newCount },
    { key: 'settings', href: `${base}/settings`, label: t('nav.settings'), badge: 0 },
  ] as const;

  const handleLogout = useCallback(() => {
    // logout() clears the httpOnly cookies (via /api/auth/logout) + local state.
    logout();
    router.push(`/${locale}/login`);
  }, [logout, router, locale]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand: the logo file, at the 40px the full mark needs */}
          <div className="flex items-center gap-3">
            <h1 className="flex">
              <BrandLogo locale={locale} className="h-10 w-auto" />
            </h1>
            <p className="border-s border-border ps-3 text-xs text-gray-500 dark:text-gray-400">
              {t('title')}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 sm:inline-flex">
              Super Admin
            </span>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t('logout')}
            </button>
          </div>
        </div>
        <nav aria-label={t('title')} className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6 lg:px-8">
          {navItems.map((item) => {
            const active = section === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
                {item.badge > 0 && (
                  <span
                    className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground"
                    aria-label={t('leads.newBadge', { count: item.badge })}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
