'use client';

/**
 * Reports Center
 *
 * Report-type selector + filter panel + results table, with PDF/Excel
 * export. Access: Admin + Moderator with can_view_reports.
 */

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/i18n/format';
import { useAuth } from '@/lib/auth/auth-context';
import { RequireAccess } from '@/components/auth/require-access';
import { useToast } from '@/components/feedback/toast-provider';
import { DataTable, Column } from '@/components/tables/data-table';
import {
  Users,
  FileText,
  Download,
  FileSpreadsheet,
  Loader2,
  } from 'lucide-react';

type ReportType = 'financial' | 'attendance' | 'subscription' | 'captainPerformance' | 'expiringSoon' | 'levelGroupTransitions';

interface CaptainOption {
  id: string;
  user: { name: string };
}


/** One plan's line in the financial report's income by plan. */
interface PlanIncome {
  planName: string;
  traineeCount: number;
  income: number | string;
  referrals?: { new?: number; network?: number; continuous?: number; old?: number };
}

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function ReportsCenterPageContent() {
  const t = useTranslations('reports');
  const locale = useLocale();
  const tCommon = useTranslations('common');
  const tTrainees = useTranslations('trainees');
  const { authFetch } = useAuth();
  const { toast } = useToast();

  const [type, setType] = useState<ReportType>('financial');
  const [dateFrom, setDateFrom] = useState(todayIso(-30));
  const [dateTo, setDateTo] = useState(todayIso());
  const [status, setStatus] = useState('');
  const [captainId, setCaptainId] = useState('');
  const [captains, setCaptains] = useState<CaptainOption[]>([]);

  const [result, setResult] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    authFetch('/api/captains?limit=100')
      .then((res) => res.json())
      .then((data) => setCaptains(data.data || []))
      .catch(() => {});
  }, [authFetch]);

  const buildQuery = useCallback(
    (format: 'json' | 'pdf' | 'excel') => {
      const qs = new URLSearchParams({ type, format });
      if (type === 'expiringSoon') {
        // Current-state report — no date range.
      } else if (type === 'subscription') {
        if (dateFrom) qs.set('dateFrom', dateFrom);
      } else {
        qs.set('dateFrom', dateFrom);
        qs.set('dateTo', dateTo);
      }
      if (type === 'subscription' && status) qs.set('status', status);
      if ((type === 'attendance' || type === 'captainPerformance') && captainId) {
        qs.set('captainId', captainId);
      }
      return qs;
    },
    [type, dateFrom, dateTo, status, captainId]
  );


  const handleGenerate = async () => {
    setIsLoading(true);
    setResult(null);
    try {
      const res = await authFetch(`/api/reports?${buildQuery('json')}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }
      setResult(data.data);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    setIsExporting(true);
    try {
      const res = await authFetch(`/api/reports?${buildQuery(format)}`);
      if (!res.ok) throw new Error(t('exportFailed'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsExporting(false);
    }
  };


  const reportTypes: { value: ReportType; label: string }[] = [
    { value: 'financial', label: t('financial') },
    { value: 'attendance', label: t('attendance') },
    { value: 'subscription', label: t('subscription') },
    { value: 'captainPerformance', label: t('captainPerformance') },
    { value: 'expiringSoon', label: t('expiringSoon') },
    { value: 'levelGroupTransitions', label: t('transitions') },
  ];

  // Codes from the report data (INCOME, PRESENT, ACTIVE…) in the page language.
  const valueLabel = (v: unknown) =>
    typeof v === 'string' && t.has(`value.${v}`) ? t(`value.${v}`) : String(v ?? '—');

  // Summary figures: labels from the messages (they used to be the data's
  // field names, uppercased: "OUTSTANDINGPAYMENTS"), money with 2 decimals,
  // counts as whole numbers, the attendance rate as a percentage.
  const MONEY = new Set(['revenue', 'collections', 'expenses', 'outstandingPayments', 'profitLoss']);
  const summaryLabel = (key: string) => (t.has(`summary.${key}`) ? t(`summary.${key}`) : key);
  const summaryValue = (key: string, value: unknown) => {
    if (typeof value !== 'number') return String(value);
    if (key === 'attendanceRate') return `${formatNumber(value, locale, { maximumFractionDigits: 1 })}%`;
    if (MONEY.has(key)) return formatNumber(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return formatNumber(value, locale, { maximumFractionDigits: 0 });
  };

  const columnsByType: Record<ReportType, Column<any>[]> = {
    financial: [
      { key: 'date', header: t('dateRange') },
      { key: 'type', header: t('col.type'), render: (r) => valueLabel(r.type) },
      { key: 'amount', header: t('col.amount') },
    ],
    attendance: [
      { key: 'date', header: t('dateRange') },
      { key: 'traineeName', header: t('col.trainee') },
      { key: 'groupName', header: t('col.group') },
      { key: 'status', header: t('col.status'), render: (r) => valueLabel(r.status) },
    ],
    subscription: [
      { key: 'traineeName', header: t('col.trainee') },
      { key: 'planName', header: t('col.plan') },
      { key: 'levelName', header: t('col.level') },
      { key: 'status', header: t('col.status'), render: (r) => valueLabel(r.status) },
      { key: 'startDate', header: t('col.start') },
      { key: 'endDate', header: t('col.end') },
    ],
    captainPerformance: [
      { key: 'captainName', header: t('col.captain') },
      { key: 'sessionsConducted', header: t('col.sessions') },
      { key: 'attendanceRate', header: t('col.attendanceRate'), render: (r) => (typeof r.attendanceRate === 'number' ? `${r.attendanceRate.toFixed(1)}%` : r.attendanceRate) },
      { key: 'evaluationsCount', header: t('col.evaluations') },
    ],
    expiringSoon: [
      { key: 'traineeName', header: t('col.trainee') },
      { key: 'phone', header: t('col.phone'), render: (r) => <span dir="ltr">{r.phone}</span> },
      { key: 'planName', header: t('col.plan') },
      { key: 'levelName', header: t('col.level') },
      { key: 'groupName', header: t('col.group') },
      { key: 'sessions', header: t('col.sessions') },
      { key: 'sessionsRemaining', header: t('col.remaining') },
      { key: 'endDate', header: t('col.end') },
    ],
    levelGroupTransitions: [
      { key: 'date', header: t('col.date') },
      { key: 'traineeName', header: t('col.trainee') },
      { key: 'levelChange', header: t('col.levelChange') },
      { key: 'groupChange', header: t('col.groupChange') },
      { key: 'changedBy', header: t('col.changedBy') },
    ],
  };

  const records: any[] = result?.records ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold tracking-wide text-foreground flex items-center gap-2">
        <FileText size={22} className="text-primary dark:text-primary" />
        {t('title')}
      </h2>

      {/* ─── Filter Panel ─── */}
      <div className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-xl space-y-4">
        <div className="flex flex-wrap gap-2">
          {reportTypes.map((rt) => (
            <button
              key={rt.value}
              onClick={() => {
                setType(rt.value);
                setResult(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                type === rt.value
                  ? 'bg-primary/10 text-primary dark:text-primary border border-primary/30'
                  : 'border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {rt.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {type !== 'expiringSoon' && (
            <div className="space-y-1.5">
              <label htmlFor="dashboard-reports-f1" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('from')}
              </label>
              <input id="dashboard-reports-f1"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          )}
          {type !== 'subscription' && type !== 'expiringSoon' && (
            <div className="space-y-1.5">
              <label htmlFor="dashboard-reports-f2" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('to')}
              </label>
              <input id="dashboard-reports-f2"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          )}
          {type === 'subscription' && (
            <div className="space-y-1.5">
              <label htmlFor="dashboard-reports-f3" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('col.status')}
              </label>
              <select id="dashboard-reports-f3"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">{t('all')}</option>
                <option value="ACTIVE">{t('value.ACTIVE')}</option>
                <option value="EXPIRED">{t('value.EXPIRED')}</option>
                <option value="FROZEN">{t('value.FROZEN')}</option>
              </select>
            </div>
          )}
          {(type === 'attendance' || type === 'captainPerformance') && (
            <div className="space-y-1.5">
              <label htmlFor="dashboard-reports-f4" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('col.captain')}
              </label>
              <select id="dashboard-reports-f4"
                value={captainId}
                onChange={(e) => setCaptainId(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">{t('all')}</option>
                {captains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.user.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-300 disabled:opacity-50"
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {t('generate')}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Results ─── */}
      {result && (
        <>
          {result.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(result.summary).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-xl"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    {summaryLabel(key)}
                  </span>
                  <span className="text-xl font-extrabold text-foreground" dir="ltr">
                    {summaryValue(key, value)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {type === 'financial' && result.byPlan && result.byPlan.length > 0 && (
            <div className="bg-card/70 border border-border rounded-2xl p-4 backdrop-blur-xl">
              <h3 className="text-sm font-bold text-foreground mb-3">{t('incomeByPlan')}</h3>
              {/* Phones: one row per plan, income first. The seven-column
                  table cut off the income behind a sideways scroll. */}
              <ul className="md:hidden divide-y divide-border/60">
                {(result.byPlan as PlanIncome[]).map((p, i) => (
                  <li key={i} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words text-sm font-medium text-foreground">{p.planName}</span>
                      <span className="flex-shrink-0 text-sm font-semibold text-success" dir="ltr">{Number(p.income).toFixed(2)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <Users className="inline w-3 h-3 -mt-0.5 me-1" aria-hidden="true" />{p.traineeCount} · {tTrainees('referralNew')} {p.referrals?.new ?? 0} · {tTrainees('referralNetwork')} {p.referrals?.network ?? 0} · {tTrainees('referralContinuous')} {p.referrals?.continuous ?? 0} · {tTrainees('referralOld')} {p.referrals?.old ?? 0}
                    </p>
                  </li>
                ))}
                <li className="py-3 flex items-baseline justify-between gap-3 font-bold text-foreground">
                  <span>{t('grandTotal')}</span>
                  <span className="text-success" dir="ltr">{(result.byPlan as PlanIncome[]).reduce((sum, p) => sum + Number(p.income), 0).toFixed(2)}</span>
                </li>
              </ul>
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-start py-2">{t('col.plan')}</th>
                    <th className="text-end py-2">{t('traineesPaid')}</th>
                    <th className="text-end py-2">{tTrainees('referralNew')}</th>
                    <th className="text-end py-2">{tTrainees('referralNetwork')}</th>
                    <th className="text-end py-2">{tTrainees('referralContinuous')}</th>
                    <th className="text-end py-2">{tTrainees('referralOld')}</th>
                    <th className="text-end py-2">{t('income')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.byPlan.map((p: any, i: number) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-2 text-foreground">{p.planName}</td>
                      <td className="py-2 text-end text-foreground/80">{p.traineeCount}</td>
                      <td className="py-2 text-end text-muted-foreground">{p.referrals?.new ?? 0}</td>
                      <td className="py-2 text-end text-muted-foreground">{p.referrals?.network ?? 0}</td>
                      <td className="py-2 text-end text-muted-foreground">{p.referrals?.continuous ?? 0}</td>
                      <td className="py-2 text-end text-muted-foreground">{p.referrals?.old ?? 0}</td>
                      <td className="py-2 text-end text-success">{Number(p.income).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold text-foreground border-t border-input">
                    <td className="py-2">{t('grandTotal')}</td>
                    <td className="py-2 text-end">{result.byPlan.reduce((s: number, p: any) => s + p.traineeCount, 0)}</td>
                    <td className="py-2 text-end">{result.byPlan.reduce((s: number, p: any) => s + (p.referrals?.new ?? 0), 0)}</td>
                    <td className="py-2 text-end">{result.byPlan.reduce((s: number, p: any) => s + (p.referrals?.network ?? 0), 0)}</td>
                    <td className="py-2 text-end">{result.byPlan.reduce((s: number, p: any) => s + (p.referrals?.continuous ?? 0), 0)}</td>
                    <td className="py-2 text-end">{result.byPlan.reduce((s: number, p: any) => s + (p.referrals?.old ?? 0), 0)}</td>
                    <td className="py-2 text-end text-success">{result.byPlan.reduce((s: number, p: any) => s + Number(p.income), 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          )}

          <div className="bg-card/70 border border-border shadow-2xl rounded-2xl p-4 backdrop-blur-xl space-y-4">
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleExport('pdf')}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-border hover:border-primary/50 text-foreground/80 hover:text-foreground transition-colors disabled:opacity-50"
              >
                <Download size={14} />
                {t('exportPdf')}
              </button>
              <button
                onClick={() => handleExport('excel')}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-border hover:border-primary/50 text-foreground/80 hover:text-foreground transition-colors disabled:opacity-50"
              >
                <FileSpreadsheet size={14} />
                {t('exportExcel')}
              </button>
            </div>

            <DataTable
              columns={columnsByType[type]}
              data={records}
              emptyMessage={t('noData')}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function ReportsCenterPage() {
  return (
    <RequireAccess access="viewReports">
      <ReportsCenterPageContent />
    </RequireAccess>
  );
}
