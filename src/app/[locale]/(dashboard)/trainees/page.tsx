'use client';

/**
 * Trainees List Page
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
import { RequireAccess } from '@/components/auth/require-access';
import { useAccess } from '@/lib/auth/use-access';
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
  /** The trainee's own status; `user` is the account siblings share. */
  isActive: boolean;
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

function TraineesPageContent() {
  const t = useTranslations('trainees');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const can = useAccess();
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
      if (!res.ok) throw new Error(tCommon('loadFailed'));
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



  // ─── Table columns ──────────────────────────────────────────

  const columns: Column<TraineeRow>[] = [
    {
      key: 'systemCode',
      header: t('systemCode'),
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-primary dark:text-primary">
          {row.systemCode}
        </span>
      ),
    },
    {
      key: 'user',
      header: t('name'),
      render: (row) => (
        <div>
          <p className="font-semibold text-foreground">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.user.phoneNumber}</p>
        </div>
      ),
    },
    {
      key: 'subscriptions',
      header: t('subscription'),
      render: (row) => {
        const active = row.subscriptions?.[0];
        return active ? (
          <div className="flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-success shrink-0" />
            <div>
              <p className="text-xs text-success font-medium">{active.plan.name}</p>
              <p className="text-xs text-muted-foreground">{active.level.name}</p>
              {row.groupTrainees?.[0] && (
                <p className="text-[11px] text-primary/80 dark:text-primary/80">{row.groupTrainees[0].group.name}</p>
              )}
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{t('noActiveSubscription')}</span>
        );
      },
    },
    {
      key: 'status',
      header: tCommon('status'),
      render: (row) => (
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold w-fit ${
          row.isActive
            ? 'bg-success-soft text-success border border-success/30'
            : 'bg-muted/70 text-muted-foreground border border-input/30'
        }`}>
          {row.isActive
            ? <CheckCircle className="w-3 h-3" />
            : <XCircle className="w-3 h-3" />}
          {row.isActive ? tCommon('active') : tCommon('inactive')}
        </span>
      ),
    },
    {
      key: 'id',
      header: tCommon('actions'),
      render: (row) => (
        <button
          onClick={() => router.push(`/${locale}/trainees/${row.id}`)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-foreground/80 border border-input/60 hover:border-primary/60 hover:text-primary dark:hover:text-primary hover:bg-primary/10 transition-all"
        >
          {tCommon('view')}
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
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
            <Users className="w-6 h-6 text-primary dark:text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('countInBranch', { count: pagination.total })}
            </p>
          </div>
        </div>
        {can('manageTrainees') && (
          <button
            onClick={() => router.push(`/${locale}/trainees/new`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5"
          >
            <UserPlus className="w-4 h-4" />
            {t('register')}
          </button>
        )}
      </div>

      {/* ─── Search Bar ─── */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full ps-9 pe-4 py-2.5 bg-card/80 border border-input/60 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
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

export default function TraineesPage() {
  return (
    <RequireAccess access="viewTrainees">
      <TraineesPageContent />
    </RequireAccess>
  );
}
