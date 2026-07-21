'use client';

/**
 * ISSA — Premium Sidebar Component
 *
 * Collapsible, role-aware sidebar navigation.
 * Displays appropriate navigation items based on the user's role and moderator privileges.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { resolveSport, sportLabel } from '@/lib/theme/sports';
import { UserRole } from '@/types';
import { isRtlLocale } from '@/lib/i18n/config';
import {
  LayoutDashboard,
  Users,
  Users2, // Groups
  Award, // Captains
  GitBranch, // Branches
  CreditCard, // Subscriptions
  UserCheck, // Attendance
  Calendar, // Schedule
  DollarSign, // Finance
  FileText, // Reports
  Settings, // Settings
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

interface SidebarItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  roles?: UserRole[];
}

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const params = useParams();
  const locale = params.locale as string;
  const isRtl = isRtlLocale(locale);
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!user) return null;

  // Sport wordmark for the brand mark (visual identity; "ISSA" stays untranslated).
  const sportName = sportLabel(resolveSport(user.themeKey), locale).toUpperCase();

  // Off-canvas transform for the mobile drawer (start-side aware for RTL).
  const hiddenTransform = isRtl ? 'translate-x-full' : '-translate-x-full';

  // Navigation Items with role guards
  const navItems: SidebarItem[] = [
    {
      name: t('dashboard'),
      href: `/${locale}/dashboard`,
      icon: LayoutDashboard,
      roles: [UserRole.ADMIN, UserRole.MODERATOR, UserRole.CAPTAIN, UserRole.TRAINEE],
    },
    {
      name: t('branches'),
      href: `/${locale}/branches`,
      icon: GitBranch,
      roles: [UserRole.ADMIN],
    },
    {
      name: t('users'),
      href: `/${locale}/users`,
      icon: Users,
      roles: [UserRole.ADMIN],
    },
    {
      name: t('trainees'),
      href: `/${locale}/trainees`,
      icon: Users, // Using Users as a fallback for Swimmer
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
    },
    {
      name: t('captains'),
      href: `/${locale}/captains`,
      icon: Award,
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
    },
    {
      name: t('subscriptions'),
      href: `/${locale}/subscriptions`,
      icon: CreditCard,
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
    },
    {
      name: t('groups'),
      href: `/${locale}/groups`,
      icon: Users2,
      roles: [UserRole.ADMIN, UserRole.MODERATOR, UserRole.CAPTAIN],
    },
    {
      name: t('schedule'),
      href: `/${locale}/schedule`,
      icon: Calendar,
      roles: [UserRole.ADMIN, UserRole.MODERATOR, UserRole.CAPTAIN],
    },
    {
      name: t('attendance'),
      href: `/${locale}/attendance`,
      icon: UserCheck,
      // Attendance is marked by Admin/Moderator only — not captains.
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
    },
    {
      name: t('finance'),
      href: `/${locale}/finance`,
      icon: DollarSign,
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
    },
    {
      name: t('reports'),
      href: `/${locale}/reports`,
      icon: FileText,
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
    },
    {
      name: t('settings'),
      href: `/${locale}/settings`,
      icon: Settings,
      roles: [UserRole.ADMIN],
    },
  ];

  const filteredItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(user.role as UserRole);
  });

  return (
    <>
      {/* Mobile overlay — tap to dismiss the drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 start-0 z-50 w-64 md:relative md:inset-auto md:z-30 flex flex-col bg-white dark:bg-slate-900 border-e border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 h-screen transition-transform duration-300 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : hiddenTransform
        } ${isCollapsed ? 'md:w-20' : 'md:w-64'}`}
      >
      {/* ─── Sidebar Header Logo ─── */}
      <div className="flex items-center justify-between px-5 py-6 border-b border-slate-200/60 dark:border-slate-800/60">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-white text-xs font-black">ISSA</span>
            </div>
            <span className="text-sm font-extrabold tracking-wider bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent">
              {sportName}
            </span>
          </div>
        )}
        {isCollapsed && (
          <div className="mx-auto h-8 w-8 rounded-lg bg-gradient-to-tr from-primary to-accent flex items-center justify-center shadow-md">
            <span className="text-white text-[10px] font-black">IS</span>
          </div>
        )}
        
        {/* Collapse Button (large screens only) */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex h-6 w-6 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors absolute -end-3 top-7 z-50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Close Button (mobile drawer only) */}
        <button
          onClick={onClose}
          className="md:hidden h-8 w-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
      </div>

      {/* ─── Navigation Items ─── */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1.5 scrollbar-thin">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group relative ${
                isActive
                  ? 'bg-gradient-to-r from-primary/15 to-accent/5 text-primary dark:text-primary border border-primary/10'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
              }`}
            >
              {/* Active state indicator dot */}
              {isActive && (
                <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-e-md bg-primary" />
              )}

              <Icon
                size={18}
                className={`transition-colors duration-300 ${
                  isActive ? 'text-primary dark:text-primary' : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200'
                }`}
              />

              {!isCollapsed && (
                <span className="truncate tracking-wide">{item.name}</span>
              )}

              {/* Tooltip for collapsed mode */}
              {isCollapsed && (
                <div className="absolute start-full ms-3 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-xl border border-slate-200 dark:border-slate-800">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ─── User Profile Footer ─── */}
      <div className="p-4 border-t border-slate-200/60 dark:border-slate-800/60 bg-slate-100/70 dark:bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center font-bold text-xs text-primary dark:text-primary">
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                {user.name}
              </p>
              <p className="text-xs text-slate-500 truncate capitalize">
                {user.role.toLowerCase()}
              </p>
            </div>
          )}
        </div>
      </div>
      </aside>
    </>
  );
}
