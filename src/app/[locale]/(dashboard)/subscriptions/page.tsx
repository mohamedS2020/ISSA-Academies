'use client';

/**
 * Subscription Plans List Page
 *
 * Shows all plans for the current branch.
 * - Plan name, period type, sessions, price, levels count, status
 * - Create → /subscriptions/new
 * - Edit inline dialog
 * - Deactivate (soft-delete)
 * - Full RTL support via logical CSS properties
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import { RequireAccess } from '@/components/auth/require-access';
import { useToast } from '@/components/feedback/toast-provider';
import { useConfirm } from '@/components/feedback/use-confirm';
import { DataTable, Column } from '@/components/tables/data-table';
import {
  CreditCard, Plus, CheckCircle, XCircle,
  Calendar, Layers, Clock, ChevronRight,
} from 'lucide-react';
import { formatNumber } from '@/lib/i18n/format';

// ─── Types ────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  periodType: 'FROM_SUBSCRIPTION_DATE' | 'FROM_MONTH_START';
  periodDays: number | null;
  minSessions: number;
  amount: string;
  freezeSessions: number;
  isActive: boolean;
  _count: { levels: number; groups: number };
  levels: { id: string; name: string }[];
}

interface Pagination {
  page: number; limit: number; total: number; totalPages: number;
}

// ─── Component ────────────────────────────────────────────────

function SubscriptionsPageContent() {
  const t = useTranslations('subscriptions');
  const [ask, confirmDialog] = useConfirm();
  const tCommon = useTranslations('common');
  const tRenewal = useTranslations('renewal');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const routeParams = useParams();
  const locale = routeParams.locale as string;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  // ─── Data fetching ────────────────────────────────────────
  const fetchPlans = useCallback(async (page: number) => {
    setIsLoading(true);
    try {
      const res = await authFetch(`/api/subscriptions/plans?page=${page}&limit=20`);
      if (!res.ok) throw new Error(tCommon('loadFailed'));
      const data = await res.json();
      setPlans(data.data || []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, toast, tCommon]);

  useEffect(() => { fetchPlans(1); }, [fetchPlans]);


  // ─── Deactivate plan ──────────────────────────────────────
  const handleDeactivate = async (planId: string) => {
    if (!(await ask({ title: t('deactivate'), message: t('deactivateConfirm'), confirmLabel: t('deactivate') }))) return;
    setDeactivatingId(planId);
    try {
      const res = await authFetch(`/api/subscriptions/plans/${planId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('deactivateFailed'));
      toast.success(t('deactivated'));
      fetchPlans(pagination.page);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeactivatingId(null);
    }
  };

  // ─── Columns ──────────────────────────────────────────────
  const columns: Column<Plan>[] = [
    {
      key: 'name',
      header: t('planName'),
      render: (row) => (
        <div>
          <p className="font-semibold text-foreground">{row.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('groupsLevels', { groups: row._count.groups, levels: row._count.levels })}
          </p>
        </div>
      ),
    },
    {
      key: 'periodType',
      header: t('period'),
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm text-foreground/80">
            {row.periodType === 'FROM_SUBSCRIPTION_DATE'
              ? t('days', { count: row.periodDays ?? 0 })
              : t('monthly')}
          </span>
        </div>
      ),
    },
    {
      key: 'minSessions',
      header: t('sessions'),
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm text-foreground/80">{tRenewal('sessions', { count: row.minSessions })}</span>
        </div>
      ),
    },
    {
      key: 'levels',
      header: t('levels'),
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.levels.slice(0, 3).map((l) => (
            <span key={l.id} className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/30 rounded text-xs">
              {l.name}
            </span>
          ))}
          {row.levels.length > 3 && (
            <span className="text-xs text-muted-foreground">+{row.levels.length - 3}</span>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: t('amount'),
      render: (row) => (
        <span className="font-semibold text-success">
          {formatNumber(Number(row.amount), locale)} {tRenewal('currency')}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: tCommon('status'),
      render: (row) => (
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold w-fit ${
          row.isActive
            ? 'bg-success-soft text-success border border-success/30'
            : 'bg-muted/70 text-muted-foreground border border-input/30'
        }`}>
          {row.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {row.isActive ? tCommon('active') : tCommon('inactive')}
        </span>
      ),
    },
    {
      key: 'id',
      header: tCommon('actions'),
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/${locale}/subscriptions/${row.id}`)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground/80 border border-input/60 hover:border-primary/60 hover:text-primary dark:hover:text-primary hover:bg-primary/10 transition-all flex items-center gap-1"
          >
            {tCommon('edit')} <ChevronRight className="w-3 h-3 rtl:-scale-x-100" />
          </button>
          {row.isActive && user?.role === UserRole.ADMIN && (
            <button
              onClick={() => handleDeactivate(row.id)}
              disabled={deactivatingId === row.id}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-danger border border-danger/30 hover:bg-danger-soft transition-all disabled:opacity-50"
            >
              {t('deactivate')}
            </button>
          )}
        </div>
      ),
    },
  ];

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {confirmDialog}
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('countInBranch', { count: pagination.total })}
            </p>
          </div>
        </div>
        {user?.role === UserRole.ADMIN && (
          <button
            onClick={() => router.push(`/${locale}/subscriptions/new`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            {t('createPlan')}
          </button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={plans}
        isLoading={isLoading}
        emptyMessage={tCommon('noResults')}
        pagination={pagination}
        onPageChange={fetchPlans}
      />
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <RequireAccess access="viewSubscriptions">
      <SubscriptionsPageContent />
    </RequireAccess>
  );
}
