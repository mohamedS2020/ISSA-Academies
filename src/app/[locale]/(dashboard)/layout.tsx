'use client';

/**
 * ISSA — Premium Dashboard Layout
 *
 * Wraps all dashboard pages with:
 *   - Authentication protection and redirection to login
 *   - A collapsible sidebar
 *   - A top header with branch and language controls
 *   - Fluid glassmorphic ocean theme styling (background glows, deep colors)
 *   - Auto RTL support (ps-, pe-, ms-, me- logical spacing)
 */

import { useEffect, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import Sidebar from '@/components/layout/sidebar';
import Header from '@/components/layout/header';
import { isRtlLocale } from '@/lib/i18n/config';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const locale = params.locale as string;
  const isRtl = isRtlLocale(locale);

  // Mobile nav drawer — shared between the hamburger (Header) and the Sidebar.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Close the drawer whenever the route changes (a nav link was tapped).
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Auth Guard Redirection
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/${locale}/login`);
    }
  }, [isLoading, isAuthenticated, locale, router]);

  // Defense-in-depth: TRAINEE role does not belong in the staff dashboard.
  // Login already redirects trainees to /portal, but a trainee who types
  // /dashboard directly in the URL would land here and see broken staff UI.
  useEffect(() => {
    if (!isLoading && isAuthenticated && user && user.role === UserRole.TRAINEE) {
      router.replace(`/${locale}/portal`);
    }
  }, [isLoading, isAuthenticated, user, locale, router]);

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Animated Background Blobs */}
        <div className="absolute top-[-10%] start-[-10%] h-[400px] w-[400px] rounded-full bg-cyan-700/10 blur-[100px] animate-pulse duration-[5000ms] pointer-events-none" />
        <div className="absolute bottom-[-10%] end-[-10%] h-[400px] w-[400px] rounded-full bg-blue-200/20 dark:bg-blue-800/10 blur-[100px] animate-pulse duration-[6000ms] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="relative h-16 w-16">
            {/* Elegant water ripples */}
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-cyan-500/40 animate-pulse" />
            <div className="absolute inset-4 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <span className="text-white text-[10px] font-black tracking-wider">ISSA</span>
            </div>
          </div>
          <div className="h-1.5 w-32 rounded-full bg-white dark:bg-slate-900 overflow-hidden relative">
            <div className="absolute top-0 bottom-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full animate-shimmer" style={{ width: '40%' }} />
          </div>
        </div>
      </div>
    );
  }

  // Prevent flash before redirect
  if (!isAuthenticated) return null;

  return (
    <div 
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex overflow-hidden font-sans relative"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ─── Elegant Background Atmosphere ─── */}
      <div className="absolute top-[10%] start-[10%] h-[500px] w-[500px] rounded-full bg-cyan-300/20 dark:bg-cyan-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] end-[10%] h-[600px] w-[600px] rounded-full bg-blue-200/30 dark:bg-blue-950/15 blur-[140px] pointer-events-none" />

      {/* Collapsible Sidebar (mobile: off-canvas drawer) */}
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      {/* Main Page Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto h-screen relative z-10">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        
        {/* Page Content Container */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
