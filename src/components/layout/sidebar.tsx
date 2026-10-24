'use client';

/**
 * Premium Sidebar Component
 *
 * Collapsible, role-aware sidebar navigation.
 * Displays appropriate navigation items based on the user's role and moderator privileges.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { useAccess } from '@/lib/auth/use-access';
import type { AccessKey } from '@/lib/auth/access';
import { resolveSport, sportLabel } from '@/lib/theme/sports';
import { UserRole } from '@/types';
import { isRtlLocale } from '@/lib/i18n/config';
import { BrandSymbol } from '@/components/layout/brand-logo';
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
  /**
   * For a moderator: the item shows only with at least one of these (from the
   * table every API route checks, src/lib/auth/access.ts). It used to show
   * every item to every moderator, whatever the owner had switched on.
   */
  access?: AccessKey[];
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
  const can = useAccess();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!user) return null;

  // Sport wordmark for the brand mark (visual identity; the platform mark comes from lib/config/brand).
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
      access: ['viewTrainees'],
    },
    {
      name: t('captains'),
      href: `/${locale}/captains`,
      icon: Award,
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
      access: ['viewCaptains'],
    },
    {
      name: t('subscriptions'),
      href: `/${locale}/subscriptions`,
      icon: CreditCard,
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
      access: ['viewSubscriptions'],
    },
    {
      name: t('groups'),
      href: `/${locale}/groups`,
      icon: Users2,
      roles: [UserRole.ADMIN, UserRole.MODERATOR, UserRole.CAPTAIN],
      access: ['viewGroups'],
    },
    {
      name: t('schedule'),
      href: `/${locale}/schedule`,
      icon: Calendar,
      roles: [UserRole.ADMIN, UserRole.MODERATOR, UserRole.CAPTAIN],
      access: ['viewSchedule'],
    },
    {
      name: t('attendance'),
      href: `/${locale}/attendance`,
      icon: UserCheck,
      // Attendance is marked by Admin/Moderator only — not captains.
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
      access: ['viewAttendance'],
    },
    {
      name: t('finance'),
      href: `/${locale}/finance`,
      icon: DollarSign,
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
      access: ['viewFinances', 'viewExpenses', 'viewReceipts', 'managePayroll'],
    },
    {
      name: t('reports'),
      href: `/${locale}/reports`,
      icon: FileText,
      roles: [UserRole.ADMIN, UserRole.MODERATOR],
      access: ['viewReports'],
    },
    {
      name: t('settings'),
      href: `/${locale}/settings`,
      icon: Settings,
      roles: [UserRole.ADMIN],
    },
  ];

  const filteredItems = navItems.filter((item) => {
    if (item.roles && !item.roles.includes(user.role as UserRole)) return false;
    if (user.role === UserRole.MODERATOR && item.access) {
      return item.access.some((access) => can(access));
    }
    return true;
  });

  return (
    <>
      {/* Mobile overlay — tap to dismiss the drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-midnight/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 start-0 z-50 w-64 md:relative md:inset-auto md:z-30 flex flex-col bg-card border-e border-border text-foreground/80 h-screen transition-transform duration-300 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : hiddenTransform
        } ${isCollapsed ? 'md:w-20' : 'md:w-64'}`}
      >
      {/* ─── Sidebar Header Logo ─── */}
      <div className="flex items-center justify-between px-5 py-6 border-b border-border/60">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5">
            <BrandSymbol className="h-8 w-auto" />
            <span className="text-sm font-extrabold tracking-wider text-foreground">
              {sportName}
            </span>
          </div>
        )}
        {isCollapsed && (
          <div className="mx-auto flex h-8 items-center">
            <BrandSymbol className="h-8 w-auto" />
          </div>
        )}
        
        {/* Collapse Button (large screens only) */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          title={isCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          className="hidden md:flex h-6 w-6 rounded-full border border-input bg-background items-center justify-center hover:bg-muted transition-colors absolute -end-3 top-7 z-50 text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? (
            <ChevronRight size={12} className="rtl:-scale-x-100" aria-hidden="true" />
          ) : (
            <ChevronLeft size={12} className="rtl:-scale-x-100" aria-hidden="true" />
          )}
        </button>

        {/* Close Button (mobile drawer only) */}
        <button
          onClick={onClose}
          className="md:hidden h-8 w-8 rounded-lg border border-input bg-background flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label={t('closeMenu')}
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
                  : 'hover:bg-muted hover:text-foreground border border-transparent'
              }`}
            >
              {/* Active state indicator dot */}
              {isActive && (
                <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-e-md bg-primary" />
              )}

              <Icon
                size={18}
                className={`transition-colors duration-300 ${
                  isActive ? 'text-primary dark:text-primary' : 'text-muted-foreground group-hover:text-foreground'
                }`}
              />

              {!isCollapsed && (
                <span className="truncate tracking-wide">{item.name}</span>
              )}

              {/* Tooltip for collapsed mode */}
              {isCollapsed && (
                <div className="absolute start-full ms-3 px-2.5 py-1.5 rounded-lg bg-background text-foreground text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-xl border border-border">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ─── User Profile Footer ─── */}
      <div className="p-4 border-t border-border/60 bg-muted/70">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-muted border border-input flex items-center justify-center font-bold text-xs text-primary dark:text-primary">
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {user.name}
              </p>
              <p className="text-xs text-muted-foreground truncate capitalize">
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
