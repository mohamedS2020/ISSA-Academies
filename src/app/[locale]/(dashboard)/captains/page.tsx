'use client';

/**
 * ISSA — Captains List Page
 *
 * - Searchable DataTable of captains in the current branch.
 * - Shows name, phone, payroll type badge, attending days, groups count.
 * - "Register Captain" → navigates to /captains/new.
 * - Edit → navigates to /captains/{id}.
 * - Access: Admin + Moderator with can_view_captains.
 * - Full RTL support via logical CSS properties.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import { DataTable, Column } from '@/components/tables/data-table';
import { RatingBadge } from '@/components/rating/star-rating';
import { useToast } from '@/components/feedback/toast-provider';
import {
  Award,
  UserPlus,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Percent,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

interface CaptainRow {
  id: string;
  specialization: string | null;
  attendingDays: string[];
  payrollType: string;
  hourlyRate: number | null;
  baseSalary: number | null;
  percentage: number | null;
  user: {
    name: string;
    phoneNumber: string;
    isActive: boolean;
  };
  rating: { average: number | null; count: number };
  _count: { groups: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
};

// ─── Component ────────────────────────────────────────────────

export default function CaptainsPage() {
  const t = useTranslations('captains');
  const tCommon = useTranslations('common');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const routeParams = useParams();
  const locale = routeParams.locale as string;

  const [captains, setCaptains] = useState<CaptainRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');

  // ─── Data fetching ──────────────────────────────────────────
  // Defined BEFORE any conditional return — hooks must never be skipped.

  const fetchCaptains = useCallback(async (page: number, searchQuery: string) => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '20' });
      if (searchQuery) qs.set('search', searchQuery);
      const res = await authFetch(`/api/captains?${qs}`);
      if (!res.ok) throw new Error('Failed to load captains');
      const data = await res.json();
      setCaptains(data.data || []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, toast, tCommon]); // search passed as arg — not in deps

  useEffect(() => {
    fetchCaptains(1, '');
  }, [fetchCaptains]);

  // Re-fetch when search changes
  useEffect(() => {
    fetchCaptains(1, search);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Access check ───────────────────────────────────────────
  // AFTER all hooks — conditional returns must never precede hook calls.

  const canView =
    user?.role === UserRole.ADMIN ||
    (user?.role === UserRole.MODERATOR &&
      (user as any).privileges?.includes('can_view_captains'));

  if (user && !canView) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 dark:text-slate-400">
        <XCircle className="w-8 h-8 me-3 text-red-600 dark:text-red-400" />
        <span>Access denied.</span>
      </div>
    );
  }

  // ─── Table columns ──────────────────────────────────────────

  const columns: Column<CaptainRow>[] = [
    {
      key: 'captain',
      header: 'Captain',
      render: (row) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900 dark:text-white">{row.user.name}</p>
            <RatingBadge average={row.rating.average} count={row.rating.count} />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">{row.user.phoneNumber}</p>
          {row.specialization && (
            <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-0.5">{row.specialization}</p>
          )}
        </div>
      ),
    },
    {
      key: 'payrollType',
      header: t('payrollType'),
      render: (row) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
          row.payrollType === 'HOURS'
            ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30'
            : 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30'
        }`}>
          {row.payrollType === 'HOURS'
            ? <><Clock className="w-3 h-3" />{t('hours')}</>
            : <><Percent className="w-3 h-3" />{t('salaryPercentage')}</>}
        </span>
      ),
    },
    {
      key: 'attendingDays',
      header: t('attendingDays'),
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.attendingDays.map((day) => (
            <span key={day} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700/60 rounded text-xs text-slate-700 dark:text-slate-300 border border-slate-300/40 dark:border-slate-600/40">
              {DAY_SHORT[day] ?? day}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'groupCount',
      header: t('assignedGroups'),
      render: (row) => (
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {row._count.groups} {row._count.groups === 1 ? 'group' : 'groups'}
        </span>
      ),
    },
    {
      key: 'status',
      header: tCommon('status'),
      render: (row) => (
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold w-fit ${
          row.user.isActive
            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
            : 'bg-slate-200/70 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border border-slate-300/30 dark:border-slate-600/30'
        }`}>
          {row.user.isActive
            ? <CheckCircle className="w-3 h-3" />
            : <XCircle className="w-3 h-3" />}
          {row.user.isActive ? tCommon('active') : tCommon('inactive')}
        </span>
      ),
    },
    {
      key: 'id',
      header: tCommon('actions'),
      render: (row) => (
        <button
          onClick={() => router.push(`/${locale}/captains/${row.id}`)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-600/60 hover:border-cyan-500/60 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-cyan-500/10 transition-all"
        >
          View
        </button>
      ),
    },
  ];

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30">
            <Award className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {pagination.total} {pagination.total === 1 ? 'captain' : 'captains'} in this branch
            </p>
          </div>
        </div>
        {(user?.role === UserRole.ADMIN ||
          (user as any)?.privileges?.includes('can_manage_captains')) && (
          <button
            onClick={() => router.push(`/${locale}/captains/new`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-cyan-500/25 transition-all duration-200 hover:-translate-y-0.5"
          >
            <UserPlus className="w-4 h-4" />
            {t('register')}
          </button>
        )}
      </div>

      {/* ─── Search Bar ─── */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 dark:text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="w-full ps-9 pe-4 py-2.5 bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all"
        />
      </div>

      {/* ─── Data Table ─── */}
      <DataTable
        columns={columns}
        data={captains}
        isLoading={isLoading}
        emptyMessage={tCommon('noResults')}
        pagination={pagination}
        onPageChange={(page) => fetchCaptains(page, search)}
      />
    </div>
  );
}
