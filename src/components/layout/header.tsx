'use client';

/**
 * ISSA — Premium Header Component
 *
 * Designed with a premium glassmorphic dark ocean theme matching the sidebar & login page.
 * Includes:
 *   - Route title translation (from 'nav' namespace)
 *   - Dynamic active branch selector dropdown (for ADMIN / MODERATOR if > 1 branch exists)
 *   - Language toggle switcher (EN/AR)
 *   - User profile dropdown menu (Logout + Change Password modal)
 *   - Full RTL/LTR logical property compatibility (ms-, me-, ps-, pe-)
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { RatingBadge } from '@/components/rating/star-rating';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { useToast } from '@/components/feedback/toast-provider';
import { UserRole } from '@/types';
import {
  Globe,
  Building,
  LogOut,
  KeyRound,
  ChevronDown,
  User,
  Shield,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Menu,
} from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export default function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const tNav = useTranslations('nav');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const tBranches = useTranslations('branches');
  const tCaptains = useTranslations('captains');
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  
  const currentLocale = params.locale as string;
  const { user, logout, setSelectedBranch, switchBranch, authFetch } = useAuth();
  const { toast } = useToast();

  // Dropdown states
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Branches list
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  // Captain's own cumulative rating (shown beside their name)
  const [captainRating, setCaptainRating] = useState<{ average: number | null; count: number } | null>(null);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Refs for closing dropdowns on outside click
  const userMenuRef = useRef<HTMLDivElement>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);

  // Fetch branches for ADMIN / MODERATOR.
  // NOTE: dependencies are PRIMITIVE values (role, branchId), not the whole
  // `user` object. Depending on `user` (a new object reference after every
  // setSelectedBranch) caused this effect to re-run in a tight loop and spam
  // the API. We also guard the default-branch selection so it only fires once.
  const userRole = user?.role;
  const userBranchId = user?.branchId;
  const hasUser = !!user;

  useEffect(() => {
    if (!hasUser) return;
    // Only tenant admins may switch branches (moderators are branch-scoped).
    if (userRole !== UserRole.ADMIN) return;

    let cancelled = false;
    setIsLoadingBranches(true);

    authFetch('/api/branches?includeInactive=false')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch branches');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list: Branch[] = data.data || [];
        setBranches(list);

        // If the user has no active branch set, default to the first one.
        if (list.length > 0 && !userBranchId) {
          setSelectedBranch(list[0].id, list[0].name);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Error fetching branches in Header:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBranches(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUser, userRole, userBranchId, authFetch]);

  // Fetch the captain's own cumulative rating for the header badge.
  useEffect(() => {
    if (userRole !== UserRole.CAPTAIN) return;
    let cancelled = false;
    authFetch('/api/captains/me/rating')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.data) setCaptainRating(data.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userRole, authFetch]);

  // Handle outside clicks
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (branchMenuRef.current && !branchMenuRef.current.contains(event.target as Node)) {
        setIsBranchMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  // Derive page title from route
  const getPageTitle = () => {
    const segments = pathname.split('/').filter(Boolean);
    // Ignore locale segment
    const relevantSegments = segments.length > 1 ? segments.slice(1) : [];
    if (relevantSegments.length === 0) return tNav('dashboard');

    const primarySegment = relevantSegments[0];
    
    // We map keys of 'nav' namespace
    const validNavKeys = [
      'dashboard',
      'users',
      'trainees',
      'captains',
      'branches',
      'subscriptions',
      'groups',
      'schedule',
      'attendance',
      'finance',
      'reports',
      'settings',
    ];

    if (validNavKeys.includes(primarySegment)) {
      return tNav(primarySegment as any);
    }

    return primarySegment.charAt(0).toUpperCase() + primarySegment.slice(1);
  };

  const handleLanguageToggle = () => {
    const nextLocale = currentLocale === 'en' ? 'ar' : 'en';
    // Persist locale selection in cookies
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    
    // Replace locale prefix in URL and navigate
    const newPathname = window.location.pathname.replace(
      `/${currentLocale}`,
      `/${nextLocale}`
    );
    router.push(newPathname);
  };

  const handleBranchSelect = async (branch: Branch) => {
    if (switchingId) return;
    if (branch.id === user?.branchId) {
      setIsBranchMenuOpen(false);
      return;
    }
    setSwitchingId(branch.id);
    try {
      await switchBranch(branch.id);
      // Full reload to a safe page so every view re-fetches under the new branch
      // (client-fetched data won't re-run on a soft navigation).
      window.location.href = `/${currentLocale}/dashboard`;
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
      setSwitchingId(null);
      setIsBranchMenuOpen(false);
    }
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
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Auto close after 2 seconds
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
    <>
      <header className="sticky top-0 z-20 w-full bg-white/80 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-900/80 backdrop-blur-lg flex items-center justify-between px-4 md:px-6 py-4">
        {/* ─── Hamburger (mobile) + Page Title ─── */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuClick}
            className="md:hidden h-9 w-9 rounded-xl bg-slate-100/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <h1 className="text-lg md:text-xl font-bold tracking-wide text-slate-900 dark:text-slate-100 uppercase truncate">
            {getPageTitle()}
          </h1>
        </div>

        {/* ─── Controls & Menus ─── */}
        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          
          {/* Branch Switcher (Admin only, and only when there is more than one branch) */}
          {user.role === UserRole.ADMIN && branches.length > 1 && (
            <div className="relative" ref={branchMenuRef}>
              <button
                onClick={() => setIsBranchMenuOpen(!isBranchMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100/70 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all duration-300 backdrop-blur-md text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              >
                <Building size={14} className="text-primary dark:text-primary" />
                <span>{user.branchName || tBranches('title')}</span>
                <ChevronDown size={12} className="text-slate-500" />
              </button>

              {isBranchMenuOpen && (
                <div className="absolute end-0 mt-2 w-56 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl p-1.5 backdrop-blur-xl z-50 animate-fadeIn">
                  <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {tCommon('filter')} {tBranches('title')}
                  </div>
                  <div className="h-px bg-white dark:bg-slate-900 my-1" />
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {branches.map((b) => {
                      const isActiveBranch = user.branchId === b.id;
                      return (
                        <button
                          key={b.id}
                          onClick={() => handleBranchSelect(b)}
                          disabled={!!switchingId}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 disabled:opacity-60 ${
                            isActiveBranch
                              ? 'bg-primary/10 text-primary dark:text-primary font-semibold'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          <span>{b.name}</span>
                          {switchingId === b.id ? (
                            <Loader2 size={12} className="animate-spin text-primary" />
                          ) : (
                            isActiveBranch && <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Language Toggle */}
          <button
            onClick={handleLanguageToggle}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100/70 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all duration-300 backdrop-blur-md text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            <Globe size={14} className="text-primary dark:text-primary" />
            <span>{currentLocale === 'en' ? 'AR' : 'EN'}</span>
          </button>

          {/* Captain rating badge (beside their name) */}
          {user.role === UserRole.CAPTAIN && captainRating && (
            <div
              className="hidden sm:flex items-center px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20"
              title={tCaptains('yourRating')}
            >
              <RatingBadge average={captainRating.average} count={captainRating.count} size={14} />
            </div>
          )}

          {/* User Dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2.5 p-1 rounded-full md:rounded-xl md:px-3 md:py-1.5 bg-slate-100/70 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all duration-300 backdrop-blur-md text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white group"
            >
              <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center font-bold text-xs text-white shadow-md">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden md:inline text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:hover:text-white truncate max-w-[120px]">
                {user.name}
              </span>
              <ChevronDown size={12} className="hidden md:inline text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute end-0 mt-2 w-64 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl p-1.5 backdrop-blur-xl z-50 animate-fadeIn">
                {/* User Info Header */}
                <div className="px-3.5 py-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{user.name}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Shield size={12} className="text-primary dark:text-primary" />
                    <span className="text-[10px] font-bold tracking-wider text-primary dark:text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase">
                      {user.role}
                    </span>
                  </div>
                </div>

                <div className="h-px bg-white dark:bg-slate-900 my-1" />

                {/* Dropdown Items */}
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsChangePasswordOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100 transition-all duration-200"
                >
                  <KeyRound size={14} className="text-slate-500" />
                  <span>{tAuth('changePassword')}</span>
                </button>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                    router.push(`/${currentLocale}/login`);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300 transition-all duration-200"
                >
                  <LogOut size={14} />
                  <span>{tAuth('logout')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ─── Change Password Modal ─── */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md px-4">
          <div className="w-full max-w-md p-1 rounded-3xl bg-gradient-to-b from-primary/10 via-primary/5 to-slate-50 dark:to-slate-950 border border-slate-200/80 dark:border-slate-800/80 shadow-2xl backdrop-blur-xl animate-scaleUp">
            <div className="bg-white/95 dark:bg-slate-950/95 rounded-[22px] p-6">
              
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-wide">
                  {tAuth('changePassword')}
                </h2>
                <button
                  onClick={() => {
                    setIsChangePasswordOpen(false);
                    setPasswordError(null);
                    setPasswordSuccess(null);
                  }}
                  className="h-7 w-7 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  &times;
                </button>
              </div>

              {/* Error Alert */}
              {passwordError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/30 border border-red-800/40 text-red-200 text-xs flex items-start gap-2.5">
                  <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{passwordError}</span>
                </div>
              )}

              {/* Success Alert */}
              {passwordSuccess && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-200 text-xs flex items-start gap-2.5">
                  <CheckCircle size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {tAuth('currentPassword')}
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-slate-900 dark:text-slate-100"
                    disabled={isSubmittingPassword || !!passwordSuccess}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {tAuth('newPassword')}
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-slate-900 dark:text-slate-100"
                    disabled={isSubmittingPassword || !!passwordSuccess}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {tAuth('confirmPassword')}
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-slate-900 dark:text-slate-100"
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
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all duration-200"
                    disabled={isSubmittingPassword || !!passwordSuccess}
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 text-white font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 disabled:opacity-50"
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
    </>
  );
}
