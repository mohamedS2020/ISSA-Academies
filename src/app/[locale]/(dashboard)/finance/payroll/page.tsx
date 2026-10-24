'use client';

/**
 * Payroll Management Page
 *
 * Select captain + period → calculate preview (auto-computed, editable) →
 * record → list of recorded payrolls with "Mark Paid" action.
 * Admin-only (captain compensation is sensitive data).
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { RequireAccess } from '@/components/auth/require-access';
import { useToast } from '@/components/feedback/toast-provider';
import { DataTable, Column } from '@/components/tables/data-table';
import { Calculator, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

interface CaptainOption {
  id: string;
  user: { name: string };
}

interface PayrollPreview {
  captainId: string;
  captainName: string;
  payrollType: string;
  periodStart: string;
  periodEnd: string;
  hoursWorked?: number;
  hourlyRate?: number;
  baseSalary?: number;
  percentage?: number;
  percentageBase?: number;
  totalAmount: number;
}

interface PayrollRecord {
  id: string;
  captainId: string;
  periodStart: string;
  periodEnd: string;
  payrollType: string;
  totalAmount: string | number;
  isPaid: boolean;
  paidAt: string | null;
  captain: { user: { name: string } };
}

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function PayrollPageContent() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const tCaptains = useTranslations('captains');
  // HOURS / SALARY_PERCENTAGE, as the captains page names them.
  const payrollTypeLabel = (type: string) =>
    type === 'HOURS' ? tCaptains('hours') : type === 'SALARY_PERCENTAGE' ? tCaptains('salaryPercentage') : type;
  const { authFetch } = useAuth();
  const { toast } = useToast();

  const [captains, setCaptains] = useState<CaptainOption[]>([]);
  const [captainId, setCaptainId] = useState('');
  const [periodStart, setPeriodStart] = useState(todayIso(-30));
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);

  useEffect(() => {
    authFetch('/api/captains?limit=100')
      .then((res) => res.json())
      .then((data) => setCaptains(data.data || []))
      .catch(() => {});
  }, [authFetch]);

  const fetchPayrolls = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const res = await authFetch('/api/finance/payroll?page=1&limit=20');
      if (!res.ok) throw new Error(tCommon('loadFailed'));
      const data = await res.json();
      setPayrolls(data.data || []);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoadingList(false);
    }
  }, [authFetch, toast, tCommon]);

  useEffect(() => {
    fetchPayrolls();
  }, [fetchPayrolls]);

  const handleCalculate = async () => {
    if (!captainId) {
      toast.error(t('selectCaptainFirst'));
      return;
    }
    setIsCalculating(true);
    setPreview(null);
    try {
      const qs = new URLSearchParams({ captainId, periodStart, periodEnd });
      const res = await authFetch(`/api/finance/payroll/calculate?${qs}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }
      setPreview(data.data);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsCalculating(false);
    }
  };

  const handleRecord = async () => {
    if (!preview) return;
    setIsRecording(true);
    try {
      const res = await authFetch('/api/finance/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captainId: preview.captainId,
          periodStart: preview.periodStart,
          periodEnd: preview.periodEnd,
          hoursWorked: preview.hoursWorked,
          percentageBase: preview.percentageBase,
          totalAmount: preview.totalAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }
      toast.success(tCommon('success'));
      setPreview(null);
      fetchPayrolls();
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsRecording(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      const res = await authFetch(`/api/finance/payroll/${id}`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }
      toast.success(tCommon('success'));
      fetchPayrolls();
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    }
  };


  const columns: Column<PayrollRecord>[] = [
    {
      key: 'captain',
      header: t('captain'),
      className: 'font-semibold text-foreground',
      render: (row) => row.captain.user.name,
    },
    {
      key: 'period',
      header: t('payrollPeriod'),
      render: (row) => (
        <span className="text-muted-foreground text-xs">
          {new Date(row.periodStart).toLocaleDateString()} —{' '}
          {new Date(row.periodEnd).toLocaleDateString()}
        </span>
      ),
    },
    { key: 'payrollType', header: t('payrollTypeColumn'), render: (row) => payrollTypeLabel(row.payrollType) },
    {
      key: 'totalAmount',
      header: t('totalAmount'),
      render: (row) => Number(row.totalAmount).toFixed(2),
    },
    {
      key: 'isPaid',
      header: tCommon('status'),
      render: (row) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            row.isPaid
              ? 'bg-success-soft text-success border border-success/20'
              : 'bg-warning-soft text-warning border border-warning/20'
          }`}
        >
          {row.isPaid ? t('paid') : t('unpaid')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold tracking-wide text-foreground">
        {t('payroll')}
      </h2>

      {/* ─── Calculate Panel ─── */}
      <div className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="dashboard-finance-payroll-f1" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('captain')}
            </label>
            <select id="dashboard-finance-payroll-f1"
              value={captainId}
              onChange={(e) => setCaptainId(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">{t('selectPlaceholder')}</option>
              {captains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.user.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dashboard-finance-payroll-f2" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('periodStart')}
            </label>
            <input id="dashboard-finance-payroll-f2"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dashboard-finance-payroll-f3" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('periodEnd')}
            </label>
            <input id="dashboard-finance-payroll-f3"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCalculate}
              disabled={isCalculating}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-300 disabled:opacity-50"
            >
              {isCalculating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Calculator size={14} />
              )}
              {t('calculatePayroll')}
            </button>
          </div>
        </div>

        {preview && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              {preview.captainName} · {payrollTypeLabel(preview.payrollType)}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {preview.payrollType === 'HOURS' ? (
                <>
                  <div>
                    <span className="text-muted-foreground block">{t('hoursWorked')}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={preview.hoursWorked ?? 0}
                      onChange={(e) =>
                        setPreview((p) =>
                          p
                            ? {
                                ...p,
                                hoursWorked: Number(e.target.value),
                                totalAmount:
                                  Number(e.target.value) * Number(p.hourlyRate ?? 0),
                              }
                            : p
                        )
                      }
                      className="w-full mt-1 rounded-lg border border-border bg-muted/70 px-2 py-1.5 text-foreground"
                    />
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{t('hourlyRate')}</span>
                    <span className="text-foreground font-semibold">
                      {Number(preview.hourlyRate ?? 0).toFixed(2)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-muted-foreground block">{t('baseSalary')}</span>
                    <span className="text-foreground font-semibold">
                      {Number(preview.baseSalary ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{t('percentageBase')}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={preview.percentageBase ?? 0}
                      onChange={(e) =>
                        setPreview((p) =>
                          p
                            ? {
                                ...p,
                                percentageBase: Number(e.target.value),
                                totalAmount:
                                  Number(p.baseSalary ?? 0) +
                                  (Number(p.percentage ?? 0) / 100) * Number(e.target.value),
                              }
                            : p
                        )
                      }
                      className="w-full mt-1 rounded-lg border border-border bg-muted/70 px-2 py-1.5 text-foreground"
                    />
                  </div>
                </>
              )}
              <div>
                <span className="text-muted-foreground block">{t('totalAmount')}</span>
                <span className="text-primary dark:text-primary font-bold text-base">
                  {preview.totalAmount.toFixed(2)}
                </span>
              </div>
            </div>
            <button
              onClick={handleRecord}
              disabled={isRecording}
              className="px-4 py-2 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-semibold text-xs transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isRecording && <Loader2 size={12} className="animate-spin" />}
              {t('recordPayroll')}
            </button>
          </div>
        )}
      </div>

      {/* ─── Recorded Payrolls ─── */}
      <div className="bg-card/70 border border-border shadow-2xl rounded-2xl p-4 backdrop-blur-xl">
        <DataTable
          columns={columns}
          data={payrolls}
          isLoading={isLoadingList}
          emptyMessage={tCommon('noResults')}
          actions={(row) =>
            !row.isPaid && (
              <button
                onClick={() => handleMarkPaid(row.id)}
                className="h-7 w-7 rounded-lg border border-border hover:border-success/50 bg-background flex items-center justify-center text-muted-foreground hover:text-success transition-colors"
                title={t('markAsPaid')}
              >
                <CheckCircle size={13} />
              </button>
            )
          }
        />
      </div>
    </div>
  );
}

export default function PayrollPage() {
  return (
    <RequireAccess access="managePayroll">
      <PayrollPageContent />
    </RequireAccess>
  );
}
