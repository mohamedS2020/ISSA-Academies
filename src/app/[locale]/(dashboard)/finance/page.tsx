'use client';

/**
 * Financial Dashboard
 *
 * KPI cards (income, expenses, net profit, outstanding) + a recharts
 * income-vs-expenses area chart, filterable by date range.
 * Access: Admin + Moderator with can_view_finances.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { RequireAccess } from '@/components/auth/require-access';
import { useAccess } from '@/lib/auth/use-access';
import { useToast } from '@/components/feedback/toast-provider';
import { SkeletonDashboard } from '@/components/feedback/skeleton-loader';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  Receipt,
  Banknote,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

// recharts loaded on-demand (kept out of the finance page's initial bundle).
const AreaTrendChart = dynamic(
  () => import('@/components/charts/area-trend-chart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] w-full animate-pulse rounded-xl bg-muted/60" />
    ),
  }
);

interface DashboardSummary {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  outstandingBalances: number;
  series: { date: string; income: number; expenses: number }[];
}

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function FinanceDashboardPageContent() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { user, authFetch } = useAuth();
  const can = useAccess();
  // The overview opens for anyone with a finance page; the totals themselves
  // (income, expenses, profit) need "View finances".
  const canViewFinances = can('viewFinances');
  const { toast } = useToast();
  const routeParams = useParams();
  const locale = routeParams.locale as string;

  const [dateFrom, setDateFrom] = useState(todayIso(-30));
  const [dateTo, setDateTo] = useState(todayIso());

  // Cached per date range — revisiting with the same range is instant.
  const {
    data: summary,
    isPending,
    isError,
    error,
  } = useQuery<DashboardSummary>({
    queryKey: ['finance-summary', dateFrom, dateTo],
    enabled: !!user && canViewFinances,
    queryFn: async () => {
      const qs = new URLSearchParams({ dateFrom, dateTo });
      const res = await authFetch(`/api/finance/income?${qs}`);
      if (!res.ok) throw new Error('Failed to load dashboard');
      const data = await res.json();
      return data.data;
    },
  });

  useEffect(() => {
    if (isError) {
      toast.error((error as Error)?.message || tCommon('somethingWentWrong'));
    }
  }, [isError, error, toast, tCommon]);



  // Tailwind needs full static class names (no dynamic `text-${color}-400`
  // interpolation — the JIT compiler can't see those at build time).
  const kpis = summary
    ? [
        {
          label: t('totalIncome'),
          value: summary.totalIncome,
          icon: TrendingUp,
          colorClass: 'text-success',
        },
        {
          label: t('totalExpenses'),
          value: summary.totalExpenses,
          icon: TrendingDown,
          colorClass: 'text-danger',
        },
        {
          label: t('netProfit'),
          value: summary.netProfit,
          icon: Wallet,
          colorClass: summary.netProfit >= 0 ? 'text-primary dark:text-primary' : 'text-warning',
        },
        {
          label: t('outstandingBalances'),
          value: summary.outstandingBalances,
          icon: AlertCircle,
          colorClass: 'text-warning',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-wide text-foreground">
            {t('title')}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {can('viewExpenses') && (
          <>
          <Link
            href={`/${locale}/finance/manual-income`}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-border hover:border-primary/50 text-foreground/80 hover:text-foreground transition-colors"
          >
            <TrendingUp size={14} />
            {t('manualIncome')}
          </Link>
          <Link
            href={`/${locale}/finance/expenses`}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-border hover:border-primary/50 text-foreground/80 hover:text-foreground transition-colors"
          >
            <Receipt size={14} />
            {t('expenses')}
          </Link>
          </>
          )}
          {can('viewReceipts') && (
          <Link
            href={`/${locale}/finance/receipts`}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-border hover:border-primary/50 text-foreground/80 hover:text-foreground transition-colors"
          >
            <Receipt size={14} />
            {t('receipt')}
          </Link>
          )}
          {can('managePayroll') && (
          <Link
            href={`/${locale}/finance/payroll`}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-border hover:border-primary/50 text-foreground/80 hover:text-foreground transition-colors"
          >
            <Banknote size={14} />
            {t('payroll')}
          </Link>
          )}
          {canViewFinances && (
          <>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-xl border border-border bg-muted/70 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
          <span className="text-muted-foreground text-xs">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-xl border border-border bg-muted/70 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
          </>
          )}
        </div>
      </div>

      {!canViewFinances ? null : isPending || !summary ? (
        <SkeletonDashboard />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {kpi.label}
                    </span>
                    <Icon size={16} className={kpi.colorClass} />
                  </div>
                  <p className="text-2xl font-extrabold text-foreground">
                    {kpi.value.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-xl">
            <h3 className="text-sm font-bold text-foreground mb-4">
              {t('income')} / {t('expenses')}
            </h3>
            {summary.series.length === 0 ? (
              <p className="text-xs text-muted-foreground py-12 text-center">
                {tCommon('noResults')}
              </p>
            ) : (
              <AreaTrendChart
                data={summary.series}
                height={280}
                fontSize={10}
                series={[
                  { dataKey: 'income', name: t('income') },
                  { dataKey: 'expenses', name: t('expenses') },
                ]}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function FinanceDashboardPage() {
  return (
    <RequireAccess access={['viewFinances', 'viewExpenses', 'viewReceipts', 'managePayroll']}>
      <FinanceDashboardPageContent />
    </RequireAccess>
  );
}
