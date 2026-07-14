'use client';

/**
 * ISSA — Trainees List Page
 *
 * - Searchable list of all trainees in the current branch.
 * - DataTable with system code, name, phone, status, active subscription.
 * - "Register Trainee" → navigates to /trainees/new.
 * - Access: Admin + Moderator with can_view_trainees.
 * - Full RTL support via logical CSS properties.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import { DataTable, Column } from '@/components/tables/data-table';
import { useToast } from '@/components/feedback/toast-provider';
import {
  UserPlus,
  Search,
  Users,
  CheckCircle,
  XCircle,
  CreditCard,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

interface TraineeRow {
  id: string;
  name: string;
  systemCode: string;
  user: {
    name: string;
    phoneNumber: string;
    isActive: boolean;
  };
  subscriptions: Array<{
    status: string;
    plan: { name: string };
    level: { name: string };
  }>;
  groupTrainees?: Array<{ group: { name: string } }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Component ────────────────────────────────────────────────

export default function TraineesPage() {
  const t = useTranslations('trainees');
  const tCommon = useTranslations('common');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const routeParams = useParams();
  const locale = routeParams.locale as string;

  const [trainees, setTrainees] = useState<TraineeRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Data fetching ──────────────────────────────────────────
  // Defined BEFORE any conditional return so hooks are never skipped.

  const fetchTrainees = useCallback(async (page: number, searchQuery: string) => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '20' });
      if (searchQuery) qs.set('search', searchQuery);
      const res = await authFetch(`/api/trainees?${qs}`);
      if (!res.ok) throw new Error('Failed to load trainees');
      const data = await res.json();
      setTrainees(data.data || []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, toast, tCommon]); // ← search removed: passed explicitly as argument

  useEffect(() => {
    fetchTrainees(1, '');
  }, [fetchTrainees]); // ← correct dep — stable because search is not in useCallback deps

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchTrainees(1, value);
    }, 400);
  };

  // ─── Access check ───────────────────────────────────────────
  // AFTER all hooks — conditional returns must never precede hook calls.

  const canView =
    user?.role === UserRole.ADMIN ||
    (user?.role === UserRole.MODERATOR &&
      (user as any).privileges?.includes('can_view_trainees'));

  if (user && !canView) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 dark:text-slate-400">
        <XCircle className="w-8 h-8 me-3 text-red-600 dark:text-red-400" />
        <span>Access denied. You don&apos;t have permission to view trainees.</span>
      </div>
    );
  }

  // ─── Table columns ──────────────────────────────────────────

  const columns: Column<TraineeRow>[] = [
    {
      key: 'systemCode',
      header: t('systemCode'),
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">
          {row.systemCode}
        </span>
      ),
    },
    {
      key: 'user',
      header: t('name'),
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{row.name}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{row.user.phoneNumber}</p>
        </div>
      ),
    },
    {
      key: 'subscriptions',
      header: 'Subscription',
      render: (row) => {
        const active = row.subscriptions?.[0];
        return active ? (
          <div className="flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">{active.plan.name}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{active.level.name}</p>
              {row.groupTrainees?.[0] && (
                <p className="text-[11px] text-cyan-600/80 dark:text-cyan-400/80">{row.groupTrainees[0].group.name}</p>
              )}
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-500">No active subscription</span>
        );
      },
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
          onClick={() => router.push(`/${locale}/trainees/${row.id}`)}
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
            <Users className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {pagination.total} {pagination.total === 1 ? 'trainee' : 'trainees'} in this branch
            </p>
          </div>
        </div>
        {(user?.role === UserRole.ADMIN ||
          (user as any)?.privileges?.includes('can_manage_trainees')) && (
          <button
            onClick={() => router.push(`/${locale}/trainees/new`)}
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
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full ps-9 pe-4 py-2.5 bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all"
        />
      </div>

      {/* ─── Data Table ─── */}
      <DataTable
        columns={columns}
        data={trainees}
        isLoading={isLoading}
        emptyMessage={tCommon('noResults')}
        pagination={pagination}
        onPageChange={(page) => fetchTrainees(page, search)}
      />
    </div>
  );
}
