'use client';

/**
 * ISSA — Receipts List Page
 *
 * Searchable, filterable (date range) table of all receipts for the branch.
 * Access: Admin + Moderator (per /api/finance/receipts gating).
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { DataTable, Column } from '@/components/tables/data-table';
import { useToast } from '@/components/feedback/toast-provider';
import { Receipt as ReceiptIcon, Download, Loader2 } from 'lucide-react';

interface ReceiptRow {
  id: string;
  receiptNumber: string;
  amount: string | number;
  description: string | null;
  issuedAt: string;
  trainee: { name: string; systemCode: string; user: { name: string } };
  subscription: { plan: { name: string }; level: { name: string } };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function ReceiptsPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const { toast } = useToast();

  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchReceipts = useCallback(
    async (page: number) => {
      setIsLoading(true);
      try {
        const qs = new URLSearchParams({ page: String(page), limit: '20' });
        if (dateFrom) qs.set('startDate', dateFrom);
        if (dateTo) qs.set('endDate', dateTo);
        const res = await authFetch(`/api/finance/receipts?${qs}`);
        if (!res.ok) throw new Error('Failed to load receipts');
        const data = await res.json();
        setReceipts(data.data || []);
        if (data.pagination) setPagination(data.pagination);
      } catch (err: any) {
        toast.error(err.message || tCommon('somethingWentWrong'));
      } finally {
        setIsLoading(false);
      }
    },
    [authFetch, toast, tCommon, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchReceipts(1);
  }, [fetchReceipts]);

  const handleDownload = async (receipt: ReceiptRow) => {
    setDownloadingId(receipt.id);
    try {
      const res = await authFetch(`/api/finance/receipts/${receipt.id}?format=pdf`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${receipt.receiptNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setDownloadingId(null);
    }
  };

  const columns: Column<ReceiptRow>[] = [
    {
      key: 'receiptNumber',
      header: t('receiptNumber'),
      className: 'font-mono text-xs font-semibold text-cyan-600 dark:text-cyan-400',
    },
    {
      key: 'trainee',
      header: 'Trainee',
      render: (row) => (
        <div>
          <div className="text-slate-800 dark:text-slate-200">{row.trainee.name}</div>
          <div className="text-[10px] text-slate-500 font-mono">{row.trainee.systemCode}</div>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan / Level',
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-400 text-xs">
          {row.subscription.plan.name} / {row.subscription.level.name}
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('amount'),
      render: (row) => Number(row.amount).toFixed(2),
    },
    {
      key: 'issuedAt',
      header: t('date'),
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-400">{new Date(row.issuedAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-extrabold tracking-wide bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
          <ReceiptIcon size={22} className="text-cyan-600 dark:text-cyan-400" />
          {t('receipt')}
        </h2>

        <div className="flex items-center gap-3">
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

      <div className="bg-white/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-900 shadow-2xl rounded-2xl p-4 backdrop-blur-xl">
        <DataTable
          columns={columns}
          data={receipts}
          isLoading={isLoading}
          pagination={pagination}
          onPageChange={fetchReceipts}
          emptyMessage={tCommon('noResults')}
          actions={(row) => (
            <button
              onClick={() => handleDownload(row)}
              disabled={downloadingId === row.id}
              className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-cyan-900/50 bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors disabled:opacity-50"
              title={t('downloadReceipt')}
            >
              {downloadingId === row.id ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
            </button>
          )}
        />
      </div>
    </div>
  );
}
