'use client';

/**
 * ISSA — Reports Center
 *
 * Report-type selector + filter panel + results table, with PDF/Excel
 * export. Access: Admin + Moderator with can_view_reports.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import { useToast } from '@/components/feedback/toast-provider';
import { DataTable, Column } from '@/components/tables/data-table';
import {
  FileText,
  Download,
  FileSpreadsheet,
  Loader2,
  XCircle,
} from 'lucide-react';

type ReportType = 'financial' | 'attendance' | 'subscription' | 'captainPerformance' | 'expiringSoon' | 'levelGroupTransitions';

interface CaptainOption {
  id: string;
  user: { name: string };
}

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function ReportsCenterPage() {
  const t = useTranslations('reports');
  const tCommon = useTranslations('common');
  const tTrainees = useTranslations('trainees');
  const { user, authFetch } = useAuth();
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

  const canView =
    user?.role === UserRole.ADMIN ||
    (user?.role === UserRole.MODERATOR &&
      (user as any).privileges?.includes('can_view_reports'));

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
      if (!res.ok) throw new Error('Export failed');
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

  if (user && !canView) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 dark:text-slate-400">
        <XCircle className="w-8 h-8 me-3 text-red-600 dark:text-red-400" />
        <span>Access denied.</span>
      </div>
    );
  }

  const reportTypes: { value: ReportType; label: string }[] = [
    { value: 'financial', label: t('financial') },
    { value: 'attendance', label: t('attendance') },
    { value: 'subscription', label: t('subscription') },
    { value: 'captainPerformance', label: t('captainPerformance') },
    { value: 'expiringSoon', label: t('expiringSoon') },
    { value: 'levelGroupTransitions', label: t('transitions') },
  ];

  const columnsByType: Record<ReportType, Column<any>[]> = {
    financial: [
      { key: 'date', header: t('dateRange') },
      { key: 'type', header: 'Type' },
      { key: 'amount', header: 'Amount' },
    ],
    attendance: [
      { key: 'date', header: t('dateRange') },
      { key: 'traineeName', header: 'Trainee' },
      { key: 'groupName', header: 'Group' },
      { key: 'status', header: 'Status' },
    ],
    subscription: [
      { key: 'traineeName', header: 'Trainee' },
      { key: 'planName', header: 'Plan' },
      { key: 'levelName', header: 'Level' },
      { key: 'status', header: 'Status' },
      { key: 'startDate', header: 'Start' },
      { key: 'endDate', header: 'End' },
    ],
    captainPerformance: [
      { key: 'captainName', header: 'Captain' },
      { key: 'sessionsConducted', header: 'Sessions' },
      { key: 'attendanceRate', header: 'Attendance %' },
      { key: 'evaluationsCount', header: 'Evaluations' },
    ],
    expiringSoon: [
      { key: 'traineeName', header: 'Trainee' },
      { key: 'phone', header: 'Phone' },
      { key: 'planName', header: 'Plan' },
      { key: 'levelName', header: 'Level' },
      { key: 'groupName', header: 'Group' },
      { key: 'sessions', header: 'Sessions' },
      { key: 'sessionsRemaining', header: 'Remaining' },
      { key: 'endDate', header: 'End' },
    ],
    levelGroupTransitions: [
      { key: 'date', header: 'Date' },
      { key: 'traineeName', header: 'Trainee' },
      { key: 'levelChange', header: 'Level Change' },
      { key: 'groupChange', header: 'Group Change' },
      { key: 'changedBy', header: 'Changed By' },
    ],
  };

  const records: any[] = result?.records ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold tracking-wide bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
        <FileText size={22} className="text-cyan-600 dark:text-cyan-400" />
        {t('title')}
      </h2>

      {/* ─── Filter Panel ─── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-900 bg-white/70 dark:bg-slate-900/40 p-5 backdrop-blur-xl space-y-4">
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
                  ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
                  : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {rt.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {type !== 'expiringSoon' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {t('from')}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}
          {type !== 'subscription' && type !== 'expiringSoon' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {t('to')}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}
          {type === 'subscription' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">All</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="FROZEN">Frozen</option>
              </select>
            </div>
          )}
          {(type === 'attendance' || type === 'captainPerformance') && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Captain
              </label>
              <select
                value={captainId}
                onChange={(e) => setCaptainId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">All</option>
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
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white transition-all duration-300 disabled:opacity-50"
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
                  className="rounded-2xl border border-slate-200 dark:border-slate-900 bg-white/70 dark:bg-slate-900/40 p-4 backdrop-blur-xl"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    {key}
                  </span>
                  <span className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                    {typeof value === 'number' ? value.toFixed(2) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {type === 'financial' && result.byPlan && result.byPlan.length > 0 && (
            <div className="bg-white/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-900 rounded-2xl p-4 backdrop-blur-xl">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">{t('incomeByPlan')}</h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs">
                    <th className="text-start py-2">Plan</th>
                    <th className="text-end py-2">Trainees Paid</th>
                    <th className="text-end py-2">{tTrainees('referralNew')}</th>
                    <th className="text-end py-2">{tTrainees('referralNetwork')}</th>
                    <th className="text-end py-2">{tTrainees('referralContinuous')}</th>
                    <th className="text-end py-2">{tTrainees('referralOld')}</th>
                    <th className="text-end py-2">Income</th>
                  </tr>
                </thead>
                <tbody>
                  {result.byPlan.map((p: any, i: number) => (
                    <tr key={i} className="border-b border-slate-200/40 dark:border-slate-800/40">
                      <td className="py-2 text-slate-800 dark:text-slate-200">{p.planName}</td>
                      <td className="py-2 text-end text-slate-700 dark:text-slate-300">{p.traineeCount}</td>
                      <td className="py-2 text-end text-slate-600 dark:text-slate-400">{p.referrals?.new ?? 0}</td>
                      <td className="py-2 text-end text-slate-600 dark:text-slate-400">{p.referrals?.network ?? 0}</td>
                      <td className="py-2 text-end text-slate-600 dark:text-slate-400">{p.referrals?.continuous ?? 0}</td>
                      <td className="py-2 text-end text-slate-600 dark:text-slate-400">{p.referrals?.old ?? 0}</td>
                      <td className="py-2 text-end text-emerald-700 dark:text-emerald-300">{Number(p.income).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold text-slate-900 dark:text-slate-100 border-t border-slate-300 dark:border-slate-700">
                    <td className="py-2">GRAND TOTAL</td>
                    <td className="py-2 text-end">{result.byPlan.reduce((s: number, p: any) => s + p.traineeCount, 0)}</td>
                    <td className="py-2 text-end">{result.byPlan.reduce((s: number, p: any) => s + (p.referrals?.new ?? 0), 0)}</td>
                    <td className="py-2 text-end">{result.byPlan.reduce((s: number, p: any) => s + (p.referrals?.network ?? 0), 0)}</td>
                    <td className="py-2 text-end">{result.byPlan.reduce((s: number, p: any) => s + (p.referrals?.continuous ?? 0), 0)}</td>
                    <td className="py-2 text-end">{result.byPlan.reduce((s: number, p: any) => s + (p.referrals?.old ?? 0), 0)}</td>
                    <td className="py-2 text-end text-emerald-600 dark:text-emerald-400">{result.byPlan.reduce((s: number, p: any) => s + Number(p.income), 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          )}

          <div className="bg-white/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-900 shadow-2xl rounded-2xl p-4 backdrop-blur-xl space-y-4">
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleExport('pdf')}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
              >
                <Download size={14} />
                {t('exportPdf')}
              </button>
              <button
                onClick={() => handleExport('excel')}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
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
