'use client';

/**
 * ISSA — Portal Receipts (FR-TP-05)
 *
 * Receipts list + working PDF download button.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { usePortalTrainee } from '../../portal-trainee-context';
import { DataTable, Column } from '@/components/tables/data-table';
import { Receipt as ReceiptIcon, Download, Loader2 } from 'lucide-react';

interface ReceiptRow {
  id: string;
  receiptNumber: string;
  amount: string | number;
  issuedAt: string;
  subscription: { plan: { name: string }; level: { name: string } };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function PortalReceiptsPage() {
  const t = useTranslations('portal');
  const tFinance = useTranslations('finance');
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { selectedTraineeId } = usePortalTrainee();

  const fetchReceipts = useCallback(
    async (page: number) => {
      setIsLoading(true);
      try {
        const res = await authFetch(`/api/portal/receipts?page=${page}&limit=20${selectedTraineeId ? `&traineeId=${selectedTraineeId}` : ''}`);
        if (!res.ok) throw new Error('Failed to load receipts');
        const json = await res.json();
        setReceipts(json.data || []);
        if (json.pagination) setPagination(json.pagination);
      } catch (err: any) {
        toast.error(err.message || tCommon('somethingWentWrong'));
      } finally {
        setIsLoading(false);
      }
    },
    [authFetch, toast, tCommon, selectedTraineeId]
  );

  useEffect(() => {
    fetchReceipts(1);
  }, [fetchReceipts]);

  const handleDownload = async (receipt: ReceiptRow) => {
    setDownloadingId(receipt.id);
    try {
      const res = await authFetch(`/api/portal/receipts/${receipt.id}/pdf`);
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
      header: tFinance('receiptNumber'),
      className: 'font-mono text-xs font-semibold text-primary dark:text-primary',
    },
    {
      key: 'plan',
      header: t('planName'),
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-400 text-xs">
          {row.subscription.plan.name} / {row.subscription.level.name}
        </span>
      ),
    },
    {
      key: 'amount',
      header: tFinance('amount'),
      render: (row) => Number(row.amount).toFixed(2),
    },
    {
      key: 'issuedAt',
      header: tFinance('date'),
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-400">{new Date(row.issuedAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold tracking-wide bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
        <ReceiptIcon size={22} className="text-primary dark:text-primary" />
        {t('receipts')}
      </h2>

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
              className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-primary/50 bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors disabled:opacity-50"
              title={tFinance('downloadReceipt')}
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
