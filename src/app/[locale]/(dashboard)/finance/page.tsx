'use client';

/**
 * ISSA — Financial Dashboard
 *
 * KPI cards (income, expenses, net profit, outstanding) + a recharts
 * income-vs-expenses area chart, filterable by date range.
 * Access: Admin + Moderator with can_view_finances.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import { useToast } from '@/components/feedback/toast-provider';
import { SkeletonDashboard } from '@/components/feedback/skeleton-loader';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  XCircle,
  Receipt,
  Banknote,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useChartTheme } from '@/lib/theme/use-chart-theme';

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

export default function FinanceDashboardPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();
  const routeParams = useParams();
  const locale = routeParams.locale as string;
  const chart = useChartTheme();

  const [dateFrom, setDateFrom] = useState(todayIso(-30));
  const [dateTo, setDateTo] = useState(todayIso());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ dateFrom, dateTo });
      const res = await authFetch(`/api/finance/income?${qs}`);
      if (!res.ok) throw new Error('Failed to load dashboard');
      const data = await res.json();
      setSummary(data.data);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, authFetch, toast, tCommon]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const canView =
    user?.role === UserRole.ADMIN ||
    (user?.role === UserRole.MODERATOR &&
      (user as any).privileges?.includes('can_view_finances'));

  if (user && !canView) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 dark:text-slate-400">
        <XCircle className="w-8 h-8 me-3 text-red-600 dark:text-red-400" />
        <span>Access denied.</span>
      </div>
    );
  }

  // Tailwind needs full static class names (no dynamic `text-${color}-400`
  // interpolation — the JIT compiler can't see those at build time).
  const kpis = summary
    ? [
        {
          label: t('totalIncome'),
          value: summary.totalIncome,
          icon: TrendingUp,
          colorClass: 'text-emerald-600 dark:text-emerald-400',
        },
        {
          label: t('totalExpenses'),
          value: summary.totalExpenses,
          icon: TrendingDown,
          colorClass: 'text-red-600 dark:text-red-400',
        },
        {
          label: t('netProfit'),
          value: summary.netProfit,
          icon: Wallet,
          colorClass: summary.netProfit >= 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-amber-600 dark:text-amber-400',
        },
        {
          label: t('outstandingBalances'),
          value: summary.outstandingBalances,
          icon: AlertCircle,
          colorClass: 'text-amber-600 dark:text-amber-400',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-wide bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
            {t('title')}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/${locale}/finance/manual-income`}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <TrendingUp size={14} />
            {t('manualIncome')}
          </Link>
          <Link
            href={`/${locale}/finance/expenses`}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <Receipt size={14} />
            {t('expenses')}
          </Link>
          <Link
            href={`/${locale}/finance/receipts`}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <Receipt size={14} />
            {t('receipt')}
          </Link>
          <Link
            href={`/${locale}/finance/payroll`}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <Banknote size={14} />
            {t('payroll')}
          </Link>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
          />
          <span className="text-slate-500 dark:text-slate-600 text-xs">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      {isLoading || !summary ? (
        <SkeletonDashboard />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-slate-200 dark:border-slate-900 bg-white/70 dark:bg-slate-900/40 p-5 backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {kpi.label}
                    </span>
                    <Icon size={16} className={kpi.colorClass} />
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                    {kpi.value.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-900 bg-white/70 dark:bg-slate-900/40 p-5 backdrop-blur-xl">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">
              {t('income')} / {t('expenses')}
            </h3>
            {summary.series.length === 0 ? (
              <p className="text-xs text-slate-500 py-12 text-center">
                {tCommon('noResults')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={summary.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                  <XAxis dataKey="date" stroke={chart.axis} fontSize={10} />
                  <YAxis stroke={chart.axis} fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: chart.tooltipBg,
                      border: `1px solid ${chart.tooltipBorder}`,
                      borderRadius: 8,
                      fontSize: 11,
                      color: chart.tooltipText,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="#22d3ee"
                    fill="#22d3ee22"
                    name={t('income')}
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    stroke="#f87171"
                    fill="#f8717122"
                    name={t('expenses')}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}
