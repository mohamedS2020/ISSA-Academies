'use client';

/**
 * Manual Income Page
 *
 * Add-income form + DataTable with pagination, for income NOT tied to a
 * subscription (grants, rentals, one-off sales). Each entry flows into the
 * finance dashboard income/net-profit totals automatically.
 * Access: Admin + Moderator with can_view_finances (read), can_manage_expenses (write).
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { RequireAccess } from '@/components/auth/require-access';
import { useAccess } from '@/lib/auth/use-access';
import { DataTable, Column } from '@/components/tables/data-table';
import { useToast } from '@/components/feedback/toast-provider';
import { Plus, Loader2, AlertTriangle, Trash2 } from 'lucide-react';

interface ManualIncome {
  id: string;
  category: string;
  amount: string | number;
  date: string;
  description: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function ManualIncomePageContent() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const can = useAccess();
  const { toast } = useToast();

  const [incomes, setIncomes] = useState<ManualIncome[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');

  const fetchIncomes = useCallback(
    async (page: number) => {
      setIsLoading(true);
      try {
        const res = await authFetch(`/api/finance/manual-income?page=${page}&limit=20`);
        if (!res.ok) throw new Error('Failed to load income');
        const data = await res.json();
        setIncomes(data.data || []);
        if (data.pagination) setPagination(data.pagination);
      } catch (err: any) {
        toast.error(err.message || tCommon('somethingWentWrong'));
      } finally {
        setIsLoading(false);
      }
    },
    [authFetch, toast, tCommon]
  );

  useEffect(() => {
    fetchIncomes(1);
  }, [fetchIncomes]);

  const canManage = can('manageExpenses');


  const resetForm = () => {
    setIsCreateOpen(false);
    setCategory('');
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setFormError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amountNum = Number(amount);
    if (!category.trim()) {
      setFormError('Category is required');
      return;
    }
    if (!amountNum || amountNum <= 0) {
      setFormError('Amount must be a positive number');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/finance/manual-income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: category.trim(),
          amount: amountNum,
          date,
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }

      toast.success(tCommon('success'));
      resetForm();
      fetchIncomes(1);
    } catch (err: any) {
      setFormError(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (income: ManualIncome) => {
    try {
      const res = await authFetch(`/api/finance/manual-income/${income.id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }
      toast.success(tCommon('success'));
      fetchIncomes(pagination.page);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    }
  };


  const columns: Column<ManualIncome>[] = [
    { key: 'category', header: t('category'), className: 'font-semibold text-foreground' },
    {
      key: 'amount',
      header: t('amount'),
      render: (row) => <span className="text-success">{Number(row.amount).toFixed(2)}</span>,
    },
    {
      key: 'date',
      header: t('date'),
      render: (row) => (
        <span className="text-muted-foreground">{new Date(row.date).toLocaleDateString()}</span>
      ),
    },
    {
      key: 'description',
      header: t('description'),
      render: (row) => (
        <span className="text-muted-foreground max-w-xs truncate block">{row.description || '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-extrabold tracking-wide text-foreground">
          {t('manualIncome')}
        </h2>

        {canManage && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/10"
          >
            <Plus size={14} />
            <span>{t('addIncome')}</span>
          </button>
        )}
      </div>

      <div className="bg-card/70 border border-border shadow-2xl rounded-2xl p-4 backdrop-blur-xl">
        <DataTable
          columns={columns}
          data={incomes}
          isLoading={isLoading}
          pagination={pagination}
          onPageChange={fetchIncomes}
          emptyMessage={tCommon('noResults')}
          actions={
            canManage
              ? (row) => (
                  <button
                    onClick={() => handleDelete(row)}
                    className="h-7 w-7 rounded-lg border border-border hover:border-danger/50 bg-background flex items-center justify-center text-muted-foreground hover:text-danger transition-colors"
                    title={tCommon('delete')}
                  >
                    <Trash2 size={13} />
                  </button>
                )
              : undefined
          }
        />
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 backdrop-blur-md px-4">
          <div className="w-full max-w-md p-1 rounded-3xl bg-gradient-to-b from-success/10 via-accent/5 to-background border border-border/80 shadow-2xl backdrop-blur-xl">
            <div className="bg-card/95 rounded-[22px] p-6">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-foreground">{t('addIncome')}</h3>
                <button
                  onClick={resetForm}
                  className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  &times;
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-danger-soft border border-danger/40 text-danger text-xs flex items-start gap-2.5">
                  <AlertTriangle size={14} className="text-danger flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="dashboard-finance-manualincome-f1" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t('category')} <span className="text-danger">*</span>
                  </label>
                  <input id="dashboard-finance-manualincome-f1"
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder={t('incomeCategoryPlaceholder')}
                    className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-success focus:outline-none focus:ring-4 focus:ring-success/10 text-foreground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="dashboard-finance-manualincome-f2" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {t('amount')} <span className="text-danger">*</span>
                    </label>
                    <input id="dashboard-finance-manualincome-f2"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-success focus:outline-none focus:ring-4 focus:ring-success/10 text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="dashboard-finance-manualincome-f3" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {t('date')} <span className="text-danger">*</span>
                    </label>
                    <input id="dashboard-finance-manualincome-f3"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-success focus:outline-none focus:ring-4 focus:ring-success/10 text-foreground"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="dashboard-finance-manualincome-f4" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t('description')}
                  </label>
                  <textarea id="dashboard-finance-manualincome-f4"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-success focus:outline-none focus:ring-4 focus:ring-success/10 text-foreground"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all duration-200"
                    disabled={isSubmitting}
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    {isSubmitting && <Loader2 size={12} className="animate-spin" />}
                    <span>{tCommon('create')}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManualIncomePage() {
  return (
    <RequireAccess access="viewExpenses">
      <ManualIncomePageContent />
    </RequireAccess>
  );
}
